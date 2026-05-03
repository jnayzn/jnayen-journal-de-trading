import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

const BRIDGE_SCRIPT = `#!/usr/bin/env python3
"""
TradJ MT5 Bridge — synchronise automatiquement tes trades MT5 vers TradJ.

Installation:
    pip install MetaTrader5 requests

Usage:
    # Sync des 30 derniers jours (one-shot):
    python tradj_bridge.py --api-url https://TON_DOMAINE/api --api-token TON_TOKEN --days 30

    # Mode temps réel (daemon, recommande):
    python tradj_bridge.py --api-url https://TON_DOMAINE/api --api-token TON_TOKEN --watch --interval 15

    # Test sans envoyer de donnees:
    python tradj_bridge.py --api-url https://TON_DOMAINE/api --api-token TON_TOKEN --watch --dry-run
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import MetaTrader5 as mt5
except ImportError:
    print("ERROR: MetaTrader5 package not found.")
    print("Install it with: pip install MetaTrader5")
    print("Note: MetaTrader5 requires Windows with MT5 installed.")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: requests package not found. Install with: pip install requests")
    sys.exit(1)

STATE_FILE = Path.home() / ".tradj_bridge.json"
BACKFILL_WINDOW_SECONDS = 60


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"highwater": None, "seen_tickets": []}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state))


def mt5_init():
    if not mt5.initialize():
        print(f"ERROR: MT5 initialize() failed: {mt5.last_error()}")
        sys.exit(1)
    info = mt5.account_info()
    if info is None:
        print("ERROR: No MT5 account connected. Open MetaTrader 5 and log in first.")
        mt5.shutdown()
        sys.exit(1)
    print(f"Connected to MT5: Account #{info.login} | {info.server} | {info.name}")


def fetch_closed_trades(from_dt: datetime, to_dt: datetime):
    deals = mt5.history_deals_get(from_dt, to_dt)
    if deals is None:
        return []

    by_position: dict[int, list] = {}
    for d in deals:
        by_position.setdefault(d.position_id, []).append(d)

    trades = []
    for pos_id, pos_deals in by_position.items():
        if pos_id == 0:
            continue

        open_deals = [d for d in pos_deals if d.entry == mt5.DEAL_ENTRY_IN]
        close_deals = [d for d in pos_deals if d.entry == mt5.DEAL_ENTRY_OUT]
        if not open_deals or not close_deals:
            continue

        open_deal = open_deals[0]
        close_deal = close_deals[-1]

        # Determine side from the opening deal
        if open_deal.type == mt5.DEAL_TYPE_BUY:
            side = "BUY"
        else:
            side = "SELL"

        profit = sum(d.profit for d in pos_deals)
        commission = sum(d.commission for d in pos_deals)
        swap = sum(d.swap for d in pos_deals)

        trades.append({
            "ticket": str(pos_id),
            "symbol": open_deal.symbol,
            "side": side,
            "volume": open_deal.volume,
            "openPrice": open_deal.price,
            "closePrice": close_deal.price,
            "openTime": datetime.fromtimestamp(open_deal.time, tz=timezone.utc).isoformat(),
            "closeTime": datetime.fromtimestamp(close_deal.time, tz=timezone.utc).isoformat(),
            "profit": round(profit, 2),
            "commission": round(commission, 2),
            "swap": round(swap, 2),
            "magicNumber": open_deal.magic if open_deal.magic else None,
        })

    return trades


def post_trades(api_url: str, api_token: str, trades: list, dry_run: bool) -> tuple[int, int]:
    if not trades:
        return 0, 0
    if dry_run:
        print(f"  [DRY RUN] Would send {len(trades)} trade(s)")
        return len(trades), 0

    try:
        resp = requests.post(
            f"{api_url}/trades/import",
            json={"trades": trades},
            headers={"Authorization": f"Token {api_token}"},
            timeout=30,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            return data.get("imported", 0), data.get("skipped", 0)
        else:
            print(f"  ERROR: API returned {resp.status_code}: {resp.text[:200]}")
            return 0, 0
    except requests.exceptions.ConnectionError:
        print("  ERROR: Cannot connect to API. Check --api-url and your internet connection.")
        return 0, 0
    except Exception as e:
        print(f"  ERROR: {e}")
        return 0, 0


def ping_status(api_url: str, api_token: str):
    """Notify the server that bridge is alive."""
    try:
        requests.post(
            f"{api_url}/bridge/ping",
            headers={"Authorization": f"Token {api_token}"},
            timeout=10,
        )
    except Exception:
        pass


def run_once(api_url: str, api_token: str, days: int, dry_run: bool):
    to_dt = datetime.now(tz=timezone.utc)
    from_dt = to_dt - timedelta(days=days)
    print(f"Fetching trades from {from_dt.strftime('%Y-%m-%d')} to {to_dt.strftime('%Y-%m-%d')}...")

    trades = fetch_closed_trades(from_dt, to_dt)
    print(f"Found {len(trades)} closed position(s).")

    imported, skipped = post_trades(api_url, api_token, trades, dry_run)
    if not dry_run:
        print(f"Imported: {imported} | Skipped (already exist): {skipped}")
        ping_status(api_url, api_token)


def watch_loop(api_url: str, api_token: str, interval: int, dry_run: bool):
    state = load_state()
    print(f"Watch mode started (polling every {interval}s). Press Ctrl+C to stop.")

    if state["highwater"] is None:
        hw = datetime.now(tz=timezone.utc) - timedelta(days=7)
        print(f"No highwater found — starting from 7 days ago: {hw.strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        hw = datetime.fromisoformat(state["highwater"])
        print(f"Resuming from highwater: {hw.strftime('%Y-%m-%d %H:%M:%S UTC')}")

    seen_tickets = set(state.get("seen_tickets", []))

    while True:
        now = datetime.now(tz=timezone.utc)
        from_dt = hw - timedelta(seconds=BACKFILL_WINDOW_SECONDS)

        trades = fetch_closed_trades(from_dt, now)
        new_trades = [t for t in trades if t["ticket"] not in seen_tickets]

        if new_trades:
            print(f"[{now.strftime('%H:%M:%S')}] {len(new_trades)} new trade(s) found")
            imported, skipped = post_trades(api_url, api_token, new_trades, dry_run)
            if not dry_run:
                print(f"  Imported: {imported} | Skipped: {skipped}")
                ping_status(api_url, api_token)
        else:
            print(f"[{now.strftime('%H:%M:%S')}] No new trades", end="\\r", flush=True)

        if not dry_run:
            new_hw = now
            new_seen = set(t["ticket"] for t in trades)
            state = {"highwater": new_hw.isoformat(), "seen_tickets": list(new_seen)}
            save_state(state)
            hw = new_hw
            seen_tickets = new_seen

        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\\nStopped by user.")
            break


def main():
    parser = argparse.ArgumentParser(description="TradJ MT5 Bridge")
    parser.add_argument("--api-url", required=True, help="TradJ API base URL (e.g. https://your-app.replit.app/api)")
    parser.add_argument("--api-token", required=True, help="Your TradJ API token (from Settings page)")
    parser.add_argument("--days", type=int, default=30, help="Days to backfill in one-shot mode (default: 30)")
    parser.add_argument("--watch", action="store_true", help="Enable real-time watch mode")
    parser.add_argument("--interval", type=int, default=15, help="Polling interval in seconds (default: 15)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without sending data")
    args = parser.parse_args()

    api_url = args.api_url.rstrip("/")

    mt5_init()

    try:
        if args.watch:
            watch_loop(api_url, args.api_token, args.interval, args.dry_run)
        else:
            run_once(api_url, args.api_token, args.days, args.dry_run)
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
`;

// GET /bridge/download — serve the Python bridge script
router.get("/bridge/download", requireAuth, async (_req: AuthRequest, res): Promise<void> => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="tradj_bridge.py"');
  res.send(BRIDGE_SCRIPT);
});

// POST /bridge/ping — bridge heartbeat (updates lastSyncAt)
router.post("/bridge/ping", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({ lastSyncAt: new Date() })
    .where(eq(usersTable.id, req.userId!));
  res.json({ ok: true });
});

// GET /bridge/status — return bridge sync status
router.get("/bridge/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db
    .select({ lastSyncAt: usersTable.lastSyncAt })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  res.json({ lastSyncAt: user?.lastSyncAt ?? null });
});

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tradesRouter from "./trades";
import statsRouter from "./stats";
import bridgeRouter from "./bridge";
import analysisRouter from "./analysis";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tradesRouter);
router.use(statsRouter);
router.use(bridgeRouter);
router.use(analysisRouter);

export default router;

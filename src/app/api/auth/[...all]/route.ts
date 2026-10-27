import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// HTTP-эндпоинты Better Auth (/api/auth/*). Ненужные отключены в src/server/auth/config.ts.
export const { GET, POST } = toNextJsHandler(auth);

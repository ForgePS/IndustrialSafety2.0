import { createDatabase, type Database } from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { APP_ENV, DATABASE } from "../tokens.js";

export const DatabaseProvider = {
  provide: DATABASE,
  inject: [APP_ENV],
  useFactory: (env: ForgeEnvironment): Database => createDatabase(env.DATABASE_URL),
};

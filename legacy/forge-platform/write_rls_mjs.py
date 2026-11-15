from pathlib import Path
Path('scripts/import-rls-verify.mjs').write_text('''#!/usr/bin/env node
import { runPlatformApiOneOff } from "./ecs-oneoff.mjs";

const tenantA =
  process.env.IMPORT_ACCEPTANCE_TENANT_A_ID ||
  "019faa15-e558-70b6-adcd-a510c3c995f4";
const tenantB =
  process.env.IMPORT_ACCEPTANCE_TENANT_B_ID ||
  "019faa15-e578-76bd-b269-038d23c03b5e";

runPlatformApiOneOff(
  ["node", "/app/packages/database/dist/import-rls-verify-ecs.js"],
  "import-rls-verify",
  {
    environment: {
      IMPORT_ACCEPTANCE_TENANT_A_ID: tenantA,
      IMPORT_ACCEPTANCE_TENANT_B_ID: tenantB,
    },
  },
);
''', encoding='utf-8', newline='\n')
print('wrote mjs')

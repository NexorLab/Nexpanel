
import { Hono } from "hono";
import {
  decryptBackendSecret,
  validateBackendEncryptionKey,
} from "../src/services/backend-crypto";

interface Env {
  DB: D1Database;
  BACKEND_ENCRYPTION_KEY: string;
  MIGRATION_TOKEN: string;
}

interface BackendRow {
  id: string;
  uuid: string | null;
  password: string | null;
}

const app = new Hono<{ Bindings: Env }>();

app.post("/inspect", async (c) => {
  const token = c.req.header("authorization");
  if (token !== `Bearer ${c.env.MIGRATION_TOKEN}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    validateBackendEncryptionKey(c.env.BACKEND_ENCRYPTION_KEY);

    const result = await c.env.DB
      .prepare("SELECT id, uuid, password FROM backends ORDER BY id")
      .all<BackendRow>();

    let plaintextFields = 0;
    let encryptedFields = 0;
    let emptyFields = 0;

    for (const row of result.results) {
      for (const value of [row.uuid, row.password]) {
        if (value === null || value === "") {
          emptyFields++;
        } else if (value.startsWith("enc:v1:")) {
          await decryptBackendSecret(
            value,
            c.env.BACKEND_ENCRYPTION_KEY,
          );
          encryptedFields++;
        } else {
          plaintextFields++;
        }
      }
    }

    return c.json({
      success: true,
      mode: "inspect-only",
      records: result.results.length,
      plaintextFields,
      encryptedFields,
      emptyFields,
      changed: 0,
    });
  } catch {
    return c.json(
      { error: "Inspection failed. Check configuration and encrypted data." },
      500,
    );
  }
});

export default app;

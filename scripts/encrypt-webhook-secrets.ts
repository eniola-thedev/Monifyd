import { loadEnvConfig } from "@next/env";
import { adminClient } from "../src/lib/supabase/admin";
import { encryptWebhookSecret, isEncryptedWebhookSecret } from "../src/lib/security/webhook-secrets";

async function main() {
  loadEnvConfig(process.cwd());
  const db = adminClient();
  let offset = 0;
  let migrated = 0;
  while (true) {
    const { data, error } = await db.from("webhook_endpoints").select("id,secret").order("created_at").range(offset, offset + 199);
    if (error) throw new Error(`Could not load webhook endpoints: ${error.message}`);
    if (!data?.length) break;
    for (const endpoint of data) {
      if (isEncryptedWebhookSecret(endpoint.secret)) continue;
      const ciphertext = encryptWebhookSecret(endpoint.secret);
      const { data: updated, error: updateError } = await db.from("webhook_endpoints")
        .update({ secret: ciphertext }).eq("id", endpoint.id).eq("secret", endpoint.secret).select("id").maybeSingle();
      if (updateError) throw new Error(`Could not encrypt webhook secret for endpoint ${endpoint.id}: ${updateError.message}`);
      if (updated) migrated++;
    }
    offset += data.length;
    if (data.length < 200) break;
  }
  process.stdout.write(`Encrypted ${migrated} existing webhook signing secret(s). No secret values were displayed.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Webhook secret encryption failed."}\n`);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { invoiceReminderEmail } from "./invoice-reminder";

const invoice = {
  id: "inv_example",
  invoice_number: "INV-000001",
  title: "<Hosting & support>",
  amount_cents: 12500,
  currency: "USD",
  due_date: "2026-10-20",
  customer_name: "A&B",
};

const beforeDue = invoiceReminderEmail(invoice, "Merchant <One>", false, "123e4567-e89b-42d3-a456-426614174000");
assert.equal(beforeDue.subject, "Reminder: invoice INV-000001 from Merchant <One>");
assert.match(beforeDue.html, /Hi A&amp;B,/);
assert.match(beforeDue.html, /&lt;Hosting &amp; support&gt;/);
assert.match(beforeDue.html, /Payment is due on 2026-10-20/);
assert.match(beforeDue.html, /http:\/\/localhost:3000\/pay\/inv_example/);
assert.match(beforeDue.html, /http:\/\/localhost:3000\/unsubscribe\/123e4567-e89b-42d3-a456-426614174000/);
assert.match(beforeDue.html, /unsubscribe from invoice reminders/);

const dueToday = invoiceReminderEmail(invoice, "Merchant", true, "123e4567-e89b-42d3-a456-426614174000");
assert.match(dueToday.html, /Payment is due today/);

console.log("invoice reminders: ok");

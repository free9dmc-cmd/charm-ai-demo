import test from "node:test";
import assert from "node:assert/strict";
import {makeDemoRequest} from "../lib/demo/store";
function session() {
  const values = new Map<string, string>();
  return makeDemoRequest({getItem: k => values.get(k) ?? null, setItem: (k,v) => {values.set(k,v);}});
}
const post = (data = {}) => ({method: "POST", body: JSON.stringify(data)});
test("a failed edit preserves the draft, a retry succeeds & a second visitor is isolated", async () => {
  const request = session();
  const path = "/api/messages/example-draft/approve";
  assert.equal((await request(path, post({content:" "}))).status,422);
  assert.equal((await request(path, post({content:"Example revised reply"}))).status,200);
  assert.equal((await request(path, post())).status,200);
  assert.equal((await request("/api/messages/example-draft/reject", post())).status,409);
  const thread = "/api/conversations/example-thread/messages";
  assert.equal((await (await request(thread)).json()).messages[1].content,"Example revised reply");
  const other = session();
  assert.equal((await (await other(thread)).json()).messages[1].draft,true);
  assert.equal((await other("/api/messages/example-draft/reject",post())).status,200);
  assert.equal((await (await other(thread)).json()).messages.length,1);
});
test("booking works once across repeated actions & consumes the inbox suggestion", async () => {
  const request = session();
  const scan = "/api/inbox/scan-dates";
  const appointments = "/api/appointments";
  assert.equal((await request(appointments,post({title:"Example", datetime:"invalid"}))).status,422);
  const [suggestion] = (await (await request(scan,post())).json()).suggestions;
  assert.equal((await request(appointments,post(suggestion))).status,201);
  assert.equal((await request(appointments,post(suggestion))).status,200);
  assert.equal((await (await request(appointments)).json()).appointments.length,1);
  assert.deepEqual((await (await request(scan,post())).json()).suggestions,[]);
  assert.equal((await request("/api/video/room",post())).status,404);
});
test("storage failure returns an actionable error",async () => {
  const request=makeDemoRequest({getItem:()=>null,setItem:()=>{throw Error("blocked");}});
  assert.equal((await request("/api/conversations")).status,503);
});

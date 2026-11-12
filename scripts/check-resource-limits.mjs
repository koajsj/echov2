// Read actual limits; Docker's accepted HostConfig alone is not capacity evidence.
import { readFile } from "node:fs/promises";
const read = async (name) =>
  (await readFile(`/sys/fs/cgroup/${name}`, "utf8")).trim();
const memoryMax = await read("memory.max");
const cpuMax = await read("cpu.max");
const [quota, period] = cpuMax.split(" ").map(Number);
const enforced =
  memoryMax !== "max" &&
  Number(memoryMax) > 0 &&
  Number(memoryMax) <= 2147483648 &&
  Number.isFinite(quota) &&
  quota > 0 &&
  quota / period <= 1;
console.log(
  JSON.stringify({
    status: enforced ? "PASS" : "BLOCKED",
    memoryMax,
    cpuMax,
    scope:
      "limit admission only; not a workload, disk quota or VPS capacity test",
  }),
);
process.exitCode = enforced ? 0 : 1;

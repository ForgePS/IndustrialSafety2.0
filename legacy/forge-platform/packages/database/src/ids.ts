import { v7 as uuidv7 } from "uuid";

/** Application-generated UUIDv7 primary keys (no DB defaultRandom). */
export function createId(): string {
  return uuidv7();
}

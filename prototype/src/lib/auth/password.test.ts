import { describe, expect, it } from "vitest";
import { hashPassword, validateAccountInput, verifyPassword } from "./password";

describe("prototype account credentials", () => {
  it("normalizes usernames and email addresses before storage", () => {
    expect(validateAccountInput({
      username: "  Roomie_1 ",
      email: "  ROOMIE@example.com ",
      displayName: " Roomie One ",
      password: "long-enough-password",
    })).toEqual({
      username: "roomie_1",
      email: "roomie@example.com",
      displayName: "Roomie One",
      password: "long-enough-password",
    });
  });

  it("rejects invalid usernames, email addresses, names, and short passwords", () => {
    const valid = { username: "roomie", email: "r@example.com", displayName: "Roomie", password: "long-enough-password" };
    expect(() => validateAccountInput({ ...valid, username: "x" })).toThrow("Username");
    expect(() => validateAccountInput({ ...valid, email: "bad-email" })).toThrow("email");
    expect(() => validateAccountInput({ ...valid, displayName: "  " })).toThrow("Display name");
    expect(() => validateAccountInput({ ...valid, password: "short" })).toThrow("Password");
  });

  it("stores a salted scrypt hash and verifies it without accepting another password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("not the password", hash)).toBe(false);
    expect(await verifyPassword("anything", "plaintext-password")).toBe(false);
  });
});

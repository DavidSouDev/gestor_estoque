import "@testing-library/jest-dom/vitest";

import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

beforeAll(() => {
  process.env.JWT_SECRET ??= "test-jwt-secret";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
});

afterEach(() => {
  cleanup();
});

import "./prisma-mock";

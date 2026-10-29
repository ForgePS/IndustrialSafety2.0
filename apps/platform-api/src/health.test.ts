import { beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironment } from "@forge/environment";
import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter } from "./http-exception.filter.js";

describe("platform-api", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const env = loadEnvironment(LOCAL_PLACEHOLDER_ENV);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(env)],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter(env));
    await app.init();
  });

  it("health endpoint responds correctly", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);
    expect(response.body.status).toBe("healthy");
    expect(response.body.service).toBe("platform-api");
    expect(response.body.environment).toBe("local");
    expect(JSON.stringify(response.body)).not.toMatch(/DATABASE_URL|AWS_ACCOUNT_ID|secret/i);
  });

  it("errors do not expose stack traces in production mode", async () => {
    const prodEnv = loadEnvironment({
      ...LOCAL_PLACEHOLDER_ENV,
      APP_ENV: "production",
      PUBLIC_ACADEMY_URL: "https://academy.example.com",
      PUBLIC_RMS_URL: "https://rms.example.com",
      PUBLIC_CREATOR_URL: "https://creator.example.com",
      PUBLIC_API_URL: "https://api.example.com",
      DATABASE_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:000000000000:secret:db-abcdef",
      // Production fails closed without an auth-session key; supply a throwaway one.
      FORGE_AUTH_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(prodEnv)],
    }).compile();
    const prodApp = moduleRef.createNestApplication();
    prodApp.useGlobalFilters(new GlobalExceptionFilter(prodEnv));
    await prodApp.init();

    const filter = new GlobalExceptionFilter(prodEnv);
    const json = viJsonCapture(filter, new Error("boom with stack"));
    expect(JSON.stringify(json)).not.toContain("stack");
    expect(json.error.message).toBe("An unexpected error occurred.");
    await prodApp.close();
  });
});

function viJsonCapture(filter: GlobalExceptionFilter, error: Error) {
  let body: { error: { message: string } } = { error: { message: "" } };
  const response = {
    status: () => ({
      json: (payload: { error: { message: string } }) => {
        body = payload;
      },
    }),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ correlationId: "test-correlation" }),
    }),
  };
  filter.catch(error, host as never);
  return body;
}

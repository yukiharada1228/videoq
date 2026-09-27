import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccountBilling } from "../src/features/billing/account-deletion";

const mocks = vi.hoisted(() => ({ findBillingUser: vi.fn(), requireStripeClient: vi.fn(), deleteCustomer: vi.fn() }));
vi.mock("../src/repositories/billing-repository", () => ({ findBillingUser: mocks.findBillingUser }));
vi.mock("../src/features/billing/stripe", () => ({ requireStripeClient: mocks.requireStripeClient }));

const env = {} as never;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findBillingUser.mockResolvedValue({ stripeCustomerId: "cus_delete" });
  mocks.requireStripeClient.mockReturnValue({ customers: { del: mocks.deleteCustomer } });
  mocks.deleteCustomer.mockResolvedValue({ id: "cus_delete", deleted: true });
});

describe("account billing deletion", () => {
  it("deletes the customer including when the local subscription is missing or canceled", async () => {
    await deleteAccountBilling(env, "user-delete");
    expect(mocks.findBillingUser).toHaveBeenCalledExactlyOnceWith(env, { userId: "user-delete" });
    expect(mocks.deleteCustomer).toHaveBeenCalledExactlyOnceWith("cus_delete");
  });

  it.each([null, { stripeCustomerId: null }])("needs no Stripe configuration without a billing customer: %j", async user => {
    mocks.findBillingUser.mockResolvedValue(user);
    await deleteAccountBilling(env, "user-delete");
    expect(mocks.requireStripeClient).not.toHaveBeenCalled();
  });

  it("can retry after the customer was already deleted", async () => {
    mocks.deleteCustomer.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error", statusCode: 404, code: "resource_missing", message: "No such customer",
    }));
    await expect(deleteAccountBilling(env, "user-delete")).resolves.toBeUndefined();
  });

  it.each([
    new Error("Connection timed out"),
    new Stripe.errors.StripeAuthenticationError({ type: "authentication_error", statusCode: 401, message: "Invalid credential" }),
    new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", statusCode: 400, code: "resource_missing", message: "Invalid request" }),
  ])("does not allow data deletion after a Stripe failure: %s", async error => {
    mocks.deleteCustomer.mockRejectedValue(error);
    await expect(deleteAccountBilling(env, "user-delete")).rejects.toBe(error);
  });

  it("does not treat a missing configuration as an already-deleted customer", async () => {
    mocks.requireStripeClient.mockImplementation(() => { throw new Error("Stripe not configured"); });
    await expect(deleteAccountBilling(env, "user-delete")).rejects.toThrow("Stripe not configured");
  });

  it("does not contact Stripe when the database lookup fails", async () => {
    mocks.findBillingUser.mockRejectedValue(new Error("Database unavailable"));
    await expect(deleteAccountBilling(env, "user-delete")).rejects.toThrow("Database unavailable");
    expect(mocks.requireStripeClient).not.toHaveBeenCalled();
  });
});

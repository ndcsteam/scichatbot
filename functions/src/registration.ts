export type RegistrationMode = "manual" | "auto-student";

export function registrationModeFrom(value: unknown): RegistrationMode {
  return value === "auto-student" ? "auto-student" : "manual";
}

export function roleForNewAccount(
  email: string,
  bootstrapAdmins: readonly string[],
  mode: RegistrationMode,
): "admin" | "student" | "pending" {
  if (bootstrapAdmins.includes(email)) return "admin";
  if (mode === "auto-student") return "student";
  return "pending";
}

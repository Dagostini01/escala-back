import { runEscalaValidation } from "../repository/escalaValidationRepo";

export async function validateEscala(): Promise<any[]> {
  const rows = await runEscalaValidation();
  return rows;
}

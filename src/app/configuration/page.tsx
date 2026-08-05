import { redirect } from "next/navigation";

export default function ConfigurationRedirect() {
  redirect("/admin/personnes");
}

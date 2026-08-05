import { redirect } from "next/navigation";

export default function StatistiquesRedirect() {
  redirect("/analyse/tickets");
}

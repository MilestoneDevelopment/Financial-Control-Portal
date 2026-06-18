import { redirect } from "next/navigation";

/** Entry point: send users into the portfolio (middleware bounces to /login if needed). */
export default function Home() {
  redirect("/portfolio");
}

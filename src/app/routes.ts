import { createBrowserRouter } from "react-router";
import { WelcomePage } from "./components/welcome-page";
import { AdminLogin } from "./components/admin-login";
import { AdminLayout } from "./components/admin-layout";
import { Dashboard } from "./components/dashboard";
import { FoodTestingHub } from "./components/food-testing-hub";
import { SurveyPage } from "./components/survey-page";
import { ThankYouPage } from "./components/thank-you-page";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: WelcomePage,
  },
  {
    path: "/login",
    Component: AdminLogin,
  },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "testing", Component: FoodTestingHub },
      { path: "survey", Component: SurveyPage },
      { path: "thank-you", Component: ThankYouPage },
    ],
  },
]);

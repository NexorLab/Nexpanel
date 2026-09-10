import { BrowserRouter, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard/Dashboard";
import Users from "./pages/Users/Users";
import Configs from "./pages/Configs/Configs";
import Backends from "./pages/Backends/Backends";
import Subscriptions from "./pages/Subscriptions/Subscriptions";
import Settings from "./pages/Settings/Settings";
import DashboardLayout from "./layouts/DashboardLayout/DashboardLayout";

function App() {
  return (
    <BrowserRouter>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
	  <Route path="/configs" element={<Configs />} />
	  <Route path="/backends" element={<Backends />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
	   <Route path="/settings" element={<Settings />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}

export default App;
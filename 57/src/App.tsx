import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import DataManagement from "@/pages/DataManagement";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/data-management" element={<DataManagement />} />
      </Routes>
    </Router>
  );
}

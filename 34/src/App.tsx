import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import TimeSeries from "@/pages/TimeSeries";
import Clustering from "@/pages/Clustering";
import Heatmap from "@/pages/Heatmap";
import Alerts from "@/pages/Alerts";
import Navigation from "@/components/Navigation";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-white">
        <Navigation />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timeseries" element={<TimeSeries />} />
          <Route path="/clustering" element={<Clustering />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/alerts" element={<Alerts />} />
        </Routes>
      </div>
    </Router>
  );
}

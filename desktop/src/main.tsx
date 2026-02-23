import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { migrateLocalStorage } from "./utils/storageMigration";

// One-time migration from "streamio-*" to "FlowVid-*" localStorage keys
migrateLocalStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

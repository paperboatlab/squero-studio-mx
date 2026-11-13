import { createRoot } from "react-dom/client";
import "@paperboat/shared/tokens.css";
import "@paperboat/shared/plates.css";
import "@paperboat/shared/files.css";
import "@paperboat/shared/squero.css";
import "./styles.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);

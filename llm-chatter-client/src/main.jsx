import React from "react";
import ReactDOM from "react-dom/client";
//import App from "./App.jsx";
import FloatingAssistant from "./FloatingAssistant.jsx";
//import Chatter from "./Chatter.jsx";
import "./index.css";

/* ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); */

/* ReactDOM.createRoot(document.getElementById("ai-assistant-block")).render(
  <React.StrictMode>
    <Chatter />
  </React.StrictMode>
); */

ReactDOM.createRoot(document.getElementById("ai-assistant-block")).render(
  <React.StrictMode>
    <FloatingAssistant />
  </React.StrictMode>
);

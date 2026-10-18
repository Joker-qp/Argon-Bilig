import { mount } from "svelte";
import "./app.css"; // <-- BU SATIR TAILWIND'İ SİSTEME ENJEKTE EDER
import App from "./App.svelte";

const app = mount(App, {
  target: /** @type {HTMLElement} */ (document.getElementById("app")),
});

export default app;

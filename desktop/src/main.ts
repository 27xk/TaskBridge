import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import "./assets/base.css";
import "./assets/workspace.css";

createApp(App).use(createPinia()).mount("#app");

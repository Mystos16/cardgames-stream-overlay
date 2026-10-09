import { mount } from "svelte";
import Overlay from "./Overlay.svelte";
import "./overlay.css";

mount(Overlay, { target: document.getElementById("app")! });

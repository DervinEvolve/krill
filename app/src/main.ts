import "./polyfill";
import "./styles.css";
import { Notepad } from "./notepad";
import { mountDesk } from "./scene";
import { Source } from "./source";
import { Store } from "./state";

/** Mounts the desk (which builds the page shell), clips the notepad beside it, then connects to the arena or plays a recording. */
const store = new Store();
const source = await Source.choose(store);
mountDesk(store, source);

const layout = document.createElement("div");
layout.className = "layout";
const desk = document.createElement("main");
desk.className = "desk";
desk.append(...Array.from(document.body.children).filter((el) => el.tagName !== "SCRIPT"));
const pad = document.createElement("aside");
pad.className = "notepad";
pad.setAttribute("aria-label", "Arena notepad");
layout.append(desk, pad);
document.body.append(layout);

const notepad = new Notepad(pad);
store.subscribe((state) => notepad.update(state));
notepad.update(store.state);

source.start();

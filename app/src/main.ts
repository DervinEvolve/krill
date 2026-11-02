import "./polyfill";
import "./styles.css";
import { ChainLink } from "./chain";
import { FeedLink } from "./feed";
import { Notepad } from "./notepad";
import { mountDesk } from "./scene";
import { Store } from "./state";

/** Mounts the desk (which builds the page shell), clips the notepad beside it, then connects to the arena. */
const store = new Store();
const feed = new FeedLink(store);
mountDesk(store, feed);

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

new ChainLink(store);
feed.connect();

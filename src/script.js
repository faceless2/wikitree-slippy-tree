"use strict";

const APIURL = "https://api.wikitree.com/api.php";
const APPID = "MikesSlippyTree";
const DEMOID = "Windsor-1";
const SVG = "http://www.w3.org/2000/svg";
const MINSCALE = 0.2, MAXSCALE = 2.5;

/**
 * This is the entry point. If the URL has a "key" parameter it will be loaded, eg "?key=Windsor-1"
 */
function initialize(svg) {
    // Create a tree with some default settings
    const tree = new SlippyTree({
        element: "#scrollpane",
        menu: "#personMenu",
        dragScrollReversed: false,
        profileTarget: "_blank"
    });
    window.tree = tree;

    login();

    const idField = document.getElementById("idField");
    const loadButton = document.getElementById("loadButton");
    const loginButton = document.getElementById("loginButton");
    const helpButton = document.getElementById("helpButton");
    const helpContainer = document.getElementById("helpContainer");

    idField.addEventListener("change", (e) => {
        loadButton.disabled = e.target.value.trim().length == 0;
    });
    idField.addEventListener("keypress", (e) => {
        loadButton.disabled = e.target.value.trim().length == 0;
        if (e.keyCode == 13) {
            e.preventDefault();
            loadButton.click();
        }
    });
    loadButton.addEventListener("click", (e) => {
        let id = idField.value.trim();
        if (id) {
            helpContainer.classList.add("hidden");
            tree.reset(id);
        }
    });
    helpButton.addEventListener("click", (e) => {
        helpContainer.classList.toggle("hidden");
    });
    loginButton.addEventListener("click", (e) => {
        if (getCookie("userName")) {
            login(false);
        } else {
            login(true);
        }
    });

    let key = new URLSearchParams(window.location.search).get("key");
    if (key) {
        idField.value = key.trim();
        loadButton.click();
    }
}

function setCookie(key, value, expiry) {
    document.cookie = key + "=" + value + ";path=/;max-age=" + expiry;
}

function getCookie(key) {
    let keyValue = document.cookie.match('(^|;) ?' + key + '=([^;]*)(;|$)');
    return keyValue ? keyValue[2] : null;
}

/**
 * Everything to do with the login process
 * @param flag if true, initiate a login. If false, logout. If unspecified, continue the login process (do this from initialize)
 */
function login(flag) {
    const loginButton = document.getElementById("loginButton");
    const idField = document.getElementById("idField");
    if (flag === true) {
        let url = window.location.toString().replace(/\?.*/, "");
        let input;
        const form = document.createElement("form");
        form.setAttribute("method", "post");
        form.setAttribute("action", APIURL);
        let props = { action: "clientLogin", returnURL: url };
        for (let key in props) {
            form.appendChild(input = document.createElement("input"));
            input.setAttribute("type", "hidden");
            input.setAttribute("name", key);
            input.setAttribute("value", props[key]);
        }
        document.body.appendChild(form);
        form.submit();
        return;
    }
    const postLogin = () => {
        let username = getCookie("userName");
        document.querySelectorAll(".wikitree-username").forEach((e) => {
            e.innerHTML = username;
        });
        if (username) {
            loginButton.innerHTML = "Logout " + username;
            loginButton.setAttribute("data-loggedin", "true");
            if (idField.value.length == 0) {
                idField.value = username;
            }
        } else {
            loginButton.innerHTML = "Login";
            loginButton.removeAttribute("data-loggedin");
            if (idField.value.length == 0) {
                idField.value = DEMOID;
            }
        }
    }

    const params = new URLSearchParams(window.location.search);
    const authcode = params.get("authcode");
    let body = null;
    if (authcode) {
        body = "action=clientLogin&authcode=" + params.get("authcode");
    } else if (flag === false) {
        body = "action=clientLogin&doLogout=1";
        setCookie("userName", "", -1);
        setCookie("userId", "", -1);
    } else if (getCookie("userId")) {
        body = "action=clientLogin&checkLogin=" + getCookie("userId");
    }
    if (body) {
        const req = new XMLHttpRequest();
        req.open("POST", APIURL, true);
        req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        req.withCredentials = true;
        req.addEventListener("readystatechange", function() {
            if (req.readyState == 4 && req.status == 200) {
                let data = req.responseText;
                try {
                    console.log("Auth: rx "+data);
                    data = JSON.parse(data);
                    if (data.clientLogin) {
                        if (authcode)  {
                            if (data.clientLogin.result == "Success") {
                                setCookie("userName", data.clientLogin.username, 7*24*60*60);
                                setCookie("userId", data.clientLogin.userid, 7*24*60*60);
                                window.location.search = "";
                            }
                        } else if (data.clientLogin.result != "ok") {
                            setCookie("userName", "", -1);
                            setCookie("userId", "", -1);
                        }
                    }
                } catch (e) {
                    console.log(e);
                }
                postLogin();
            }
        });
        console.log("Auth: tx "+body);
        req.send(body);
    } else {
        postLogin();
    }
}

class SlippyTree {

    #refocusStart;
    #refocusEnd;

    /**
     * Props is a map with the following keys
     *  - element: the element (or selector to find the element) that will contain the map. Must be relative or absolute positioned,
     *    should be a block element and should have overflow:scrollable. Required.
     *  - menu: the element (or selector to find it) of an absolutely-positioned element containing the popup menu
     *          that will be displayed on a person when clicked. Required.
     *  - trackpad: if true, the mousewheel is identified a trackpad, if false it's a mouse. Optional, will auto-detect by default
     *  - profileTarget: the target for any links to profiles, eg "_blank". Optional
     *  - dragScrollReversed: set to true to inverse the way drag-scrolling works. Optional.
     */
    constructor(props) {
        this.props = props;
        this.scrollPane = typeof props.element == "string" ? document.querySelector(props.element) : props.element;
        this.personMenu = typeof props.menu == "string" ? document.querySelector(props.menu) : props.menu;
        this.people = [];
        this.byid = {};
        this.view = {scale: 1, cx:0, cy: 0};
        this.focus = null;
        this.#refocusStart = null;
        this.#refocusEnd = null;
        let trackpad = props.trackpad;

        if (this.scrollPane) {
            while (this.scrollPane.firstChild) {
                this.scrollPane.firstChild.remove();
            }
        } else if (typeof window != "undefined") {
            // For local testing, allow with no scrollpane
            throw new Error("\"element\" unspecified or not found");
        }
        if (this.personMenu) {
            this.scrollPane.appendChild(this.personMenu);
            for (let elt of this.personMenu.querySelectorAll("[data-action]")) {
                if (elt.getAttribute("data-action") != "profile") {
                    elt.addEventListener("click", () => {
                        this.personMenu.classList.add("hidden");
                        this.personMenu.person.action(elt.getAttribute("data-action"));
                    });
                }
            }
        }
        if (this.scrollPane) {
            this.svg = document.createElementNS(SVG, "svg");
            this.svg.classList.add("slippy-tree");
            this.scrollPane.appendChild(this.svg);
            let container = document.createElementNS(SVG, "g");
            container.classList.add("container");
            this.svg.appendChild(container);
            let n = document.createElementNS(SVG, "g");
            n.classList.add("relations");
            container.appendChild(n);
            n = document.createElementNS(SVG, "g");
            n.classList.add("labels");
            container.appendChild(n);
            n = document.createElementNS(SVG, "g");
            n.classList.add("people");
            container.appendChild(n);

            // All the mouse/scroll events are here
            const pointers = [];
            this.svg.addEventListener("pointerdown", (e) => {
                pointers.push({ id:e.pointerId, screenX: e.screenX, screenY: e.screenY });
                this.personMenu.classList.add("hidden");
            });
            this.svg.addEventListener("pointerup", (e) => {
                if (e.isPrimary) {
                    pointers.length = 0;
                } else {
                    for (let i=0;i<pointers.length;i++) {
                        if (pointers[i].id == e.pointerId) {
                            pointers.splice(i, 1);
                        }
                    }
                }
            });
            this.svg.addEventListener("pointermove", (e) => {
                e.preventDefault();
                // Set dx/dy on pointers, because iOS doesn't have these standard props and e is read-only
                for (const p of pointers) {
                    if (p.id == e.pointerId) {
                        p.dx = e.movementX;
                        p.dy = e.movementY;
                        if (p.dx === undefined) {
                            p.dx = p.dy = 0;
                            if (p.screenX !== undefined) {
                                p.dx = e.screenX - p.screenX;
                                p.dy = e.screenY - p.screenY;
                            }
                            p.screenX = e.screenX;
                            p.screenY = e.screenY;
                        }
                    } else {
                        p.dx = p.dy = 0;
                    }
                }

                if (pointers.length == 1) {
                    let elt = document.elementFromPoint(e.pageX, e.pageY);
                    if (elt == this.svg) {    // One finger dragging over background: scroll
                        this.scrollPane.scrollLeft -= pointers[0].dx;
                        this.scrollPane.scrollTop -= pointers[0].dy;
                    }
                } else if (pointers.length == 2) {  // Two fingers: pinch zoom
                    let ox0 = pointers[0].screenX;
                    let oy0 = pointers[0].screenY;
                    let ox1 = pointers[1].screenX;
                    let oy1 = pointers[1].screenY;
                    let nx0 = ox0 + pointers[0].dx;
                    let ny0 = oy0 + pointers[0].dy;
                    let nx1 = ox1 + pointers[1].dx;
                    let ny1 = oy1 + pointers[1].dy;
                    let od = Math.sqrt((ox1-ox0)*(ox1-ox0) + (oy1-oy0)*(oy1-oy0));
                    let nd = Math.sqrt((nx1-nx0)*(nx1-nx0) + (ny1-ny0)*(ny1-ny0));
                    const oscale = this.view.scale;
                    let nscale = oscale * nd / od;
                    let dx = ((nx1-ox1) + (nx0-ox0)) / 2;
                    let dy = ((ny1-oy1) + (ny0-oy0)) / 2;
                    let ncx = this.view.cx - dx / oscale;
                    let ncy = this.view.cy - dy / oscale;
                    this.reposition({scale:nscale, cx:ncx, cy:ncy});
                }
            });
            this.svg.addEventListener("wheel", (e) => {
                // If a trackpad, mousewheel will run in two directions and ctrl-wheel
                // is used to pinch-zoom. If a normal mousewheel, wheel is used to zoom
                // and only goes in one direction.
                // Assume non-trackpad until proved otherwise
                e.preventDefault();
                let view = {scale: this.view.scale, cx:this.view.cx, cy:this.view.cy};
                if (typeof trackpad != "boolean" && (e.deltaX || !Number.isInteger(e.deltaY))) {
                    trackpad = true;
                }
                if (trackpad) {
                    if (e.ctrlKey) {
                        view.scale -= e.deltaY * 0.01;
                    } else {
                        view.cx += e.deltaX / view.scale * (this.props.dragScrollReversed ? -1 : 1);
                        view.cy += e.deltaY / view.scale * (this.props.dragScrollReversed ? -1 : 1);
                    }
                } else {
                    view.scale -= e.deltaY * 0.01;
                }
                this.reposition(view);
            });
            this.scrollPane.addEventListener("scroll", () => {
                this.view.cx = (((this.scrollPane.clientWidth / 2 + this.scrollPane.scrollLeft) - this.view.padx0) / this.view.scale) + this.view.x0;
                this.view.cy = (((this.scrollPane.clientHeight / 2 + this.scrollPane.scrollTop) - this.view.pady0) / this.view.scale) + this.view.y0;
            });
            window.addEventListener("resize", (e) => { 
                tree.reposition({});
            });
        }
    }

    /**
     * Remove all nodes, start again
     * @param id the id to load, or null to just clear the tree.
     */
    reset(id) {
        this.view = {scale:1, cx:0, cy:0};
        this.people.length = 0;
        Object.keys(this.byid).forEach(key => delete this.byid[key]);
        this.focus = this.#refocusStart = this.#refocusEnd = null;
        // Clearing is a bit ad-hoc
        const container = this.svg.firstChild;
        for (let n=container.firstChild;n;n=n.nextSibling) {
            while (n.firstChild) {
                n.firstChild.remove();
            }
        }
        if (id) {
            tree.load({keys:id, nuclear:1}, () => {
                tree.refocus(tree.byid[id]);
            });
        }
    }

    /**
     * Reposition the SVG. Expects a map with properties including scale, cx and cy (center logical coordinates0
     * @param props a map to merge over the current scale map
     */
    reposition(m) {
        if (this.people.length == 0) {
            this.view = {scale: 1, cx:0, cy: 0, x0:0, x1:0, y0:0, y1:0};
        } else {
            for (let key in m) {
                let v = m[key];
                if (typeof v != "number" || !isNaN(v)) {
                    this.view[key] = m[key];
                }
            }
        }
        this.view.scale = Math.max(MINSCALE, Math.min(MAXSCALE, this.view.scale));
        const targetWidth  = Math.round((this.view.x1 - this.view.x0) * this.view.scale);
        const targetHeight = Math.round((this.view.y1 - this.view.y0) * this.view.scale);
        const viewWidth = this.scrollPane.clientWidth;
        const viewHeight = this.scrollPane.clientHeight;
        if (this.view.viewWidth != viewWidth || this.view.viewHeight != viewHeight) {
            this.view.viewWidth = viewWidth;
            this.view.viewHeight = viewHeight;
            this.view.padx0 = this.view.padx1 = Math.floor(viewWidth / 2);
            this.view.pady0 = this.view.pady1 = Math.floor(viewHeight / 2);
            if (!this.personMenu.previousClientHeight) {
                const hidden = this.personMenu.classList.contains("hidden");
                if (hidden) {
                    this.personMenu.classList.remove("hidden");
                }
                this.personMenu.previousClientHeight = this.personMenu.clientHeight;
                if (hidden) {
                    this.personMenu.classList.add("hidden");
                }
            }
            this.view.pady1 = Math.max(this.view.pady1, this.personMenu.previousClientHeight + 40);
            this.svg.style.paddingLeft   = this.view.padx0 + "px";
            this.svg.style.paddingRight  = this.view.padx1 + "px";
            this.svg.style.paddingTop    = this.view.pady0 + "px";
            this.svg.style.paddingBottom = this.view.pady1 + "px";
        }
        let tran = "scale(" + this.view.scale + " " + this.view.scale + ") ";
        tran += "translate(" + (-this.view.x0) + " " + (-this.view.y0) + ")";
        this.svg.querySelector(".container").setAttribute("transform", tran);
        this.svg.setAttribute("width", targetWidth);
        this.svg.setAttribute("height", targetHeight);

        const targetX = Math.round((this.view.cx - this.view.x0) * this.view.scale) + this.view.padx0;
        const targetY = Math.round((this.view.cy - this.view.y0) * this.view.scale) + this.view.pady0;
        this.scrollPane.scrollLeft = Math.round(targetX - viewWidth / 2);
        this.scrollPane.scrollTop  = Math.round(targetY - viewHeight / 2);
//        console.log("RESCALE: scale="+JSON.stringify(o)+" target=["+targetWidth+" "+targetHeight+"] view=["+viewWidth+" "+viewHeight+"] center=["+targetX+" "+targetY+"] tr="+tran+" sp="+x+" "+y);
        if (!this.personMenu.classList.contains("hidden")) {
            this.showMenu();
        }
    }

    /**
     * Show the popup menu
     * @param person the person the menu relates to
     * @param e the mouse event that triggered the menu
     */
    showMenu(person, e) {
        // Note both person and e can be missing to reposition the currently displayed menu
        if (!person) {
            person = this.personMenu.person;
        }
        this.personMenu.classList.remove("hidden");
        this.personMenu.showEvent = e;
        let menuWidth = this.personMenu.clientWidth;
        let c = this.fromSVGCoords({x:person.x - person.genwidth / 2, y:person.y + person.height / 2});
        let x0 = c.x;
        let y = c.y;
        let x1 = this.fromSVGCoords({x:person.x + person.genwidth / 2, y:0}).x;
        let sx;
        if (e) {
            document.querySelectorAll(".output-name").forEach((e) => {
                e.innerHTML = person.data.Name;
            });
            document.querySelectorAll("[data-action=\"profile\"]").forEach((e) => {
                // Do this to avoid issues with popup blockers if target=_blank
                if (this.props.profileTarget) {
                    e.target = this.props.profileTarget;
                }
                e.href = "https://www.wikitree.com/wiki/" + person.data.Name;
            });
            sx = (event.offsetX - x0) / (x1 - x0);
            this.personMenu.sx = sx;
            this.personMenu.person = person;
        } else {
            sx = this.personMenu.sx;
        }
        let x = Math.max(x0, Math.min(x1 - menuWidth, x0 + (x1-x0)*sx - menuWidth / 2));
        this.personMenu.style.left = x + "px";
        this.personMenu.style.top = y + "px";
        if (e && this.props.refocusOnClick) {
            this.refocus(person);
        }
    }

    /**
     * Refocus the tree
     * @param focus the person to focus the tree on. Required
     * @param callback an optional method to call when focus completes
     */
    refocus(focus, callback) {
        console.log("Focus " + focus);

        // Setup: ensure every person has an SVG
        for (const person of this.people) {
            if (!this.svg) {
                person.width = 100; // Dummy value for layout testing
                person.height = 20;
            } else if (!person.svg && !person.isHidden()) {
                let rect, path;
                person.svg = document.createElementNS(SVG, "g");
                person.svg.person = person;
                person.svg.addEventListener("click", (e) => {
                    this.showMenu(person, e);
                });
                person.svg.setAttribute("id", "person-" + person.id);
                person.svg.appendChild(rect = document.createElementNS(SVG, "rect"));
                person.svg.appendChild(path = document.createElementNS(SVG, "path"));
                this.svg.querySelector(".people").appendChild(person.svg);
                if (person.data.Gender == "Male") {
                    person.svg.classList.add("male");
                } else if (person.data.Gender == "Female") {
                    person.svg.classList.add("female");
                }
                if (person.data.IsLiving) {
                    person.svg.classList.add("living");
                } 
                if (person.data.IsMember) {
                    person.svg.classList.add("member");
                } 
                if (person.data.Privacy == 20) {
                    person.svg.classList.add("privacy-private");
                } else if (person.data.Privacy == 30) {
                    person.svg.classList.add("privacy-semi");
                } else if (person.data.Privacy == 40) {
                    person.svg.classList.add("privacy-semiopen");
                } else if (person.data.Privacy == 50) {
                    person.svg.classList.add("privacy-public");
                } 
                if (true) {
                    let text, a;
                    person.svg.appendChild(text = document.createElementNS(SVG, "text"));
                    text.appendChild(document.createTextNode(person.presentationName()));
                    text.appendChild(document.createTextNode(person.presentationExtra()));
                    let bbox = text.getBBox();
                    // NOTE: this is a hack to let us style with CSS. margin is not an SVG property
                    const style = getComputedStyle(text);
                    const pt = this.#evalLength(style, style.marginTop);
                    const pr = this.#evalLength(style, style.marginRight);
                    const pb = this.#evalLength(style, style.marginBottom);
                    const pl = this.#evalLength(style, style.marginLeft);
                    person.width = Math.ceil(bbox.width + pl + pr);
                    person.height = Math.ceil(bbox.height + pt + pb);
                    text.setAttribute("y", Math.round(pt + (person.height - pb - pt) * 0.8));
                }
                const ps = person.height * 0.6;
                path.setAttribute("d", "M 0 0 H " + ps + " L 0 " + ps + " Z");
                rect.setAttribute("height", person.height);
                if (!person.x) {
                    if (person.growFrom) {
                        person.x = person.tx = person.growFrom.x;
                        person.y = person.ty = person.growFrom.y;
                    } else if (focus) {
                        person.x = focus.x;
                        person.y = focus.y;
                    }
                }
            }
        }

        // First sort people into priority, then
        // position based on focus node and priority
        // After this each person has "tx" and "ty" value set
        let ordered = this.order(focus, this.people);
        let marriages = [];
        this.placeNodes(focus, ordered, marriages);

        // Re-add edges, people, labels in priority order
        const peoplepane = this.svg.querySelector(".people");
        const edges = this.svg.querySelector(".relations");
        const labels = this.svg.querySelector(".labels");
        while (edges.firstChild) {
            edges.firstChild.remove();
        }
        while (labels.firstChild) {
            labels.firstChild.remove();
        }
        while (peoplepane.firstChild) {
            peoplepane.firstChild.remove();
        }
        let focusedges = [];
        for (const person of ordered) {
            if (isNaN(person.tx) || isNaN(person.ty)) throw new Error("Person="+person+" g="+person.generation+" tx="+person.tx+" ty="+person.ty);
            if (typeof person.x != "number") {
                person.x = person.tx;
            }
            if (typeof person.y != "number") {
                person.y = person.ty;
            }
            peoplepane.appendChild(person.svg);

            for (const r of person.relations) {
                let path = null;
                if (!r.person.hidden) {
                    if (r.rel == "parent") {
                        path = document.createElementNS(SVG, "path");
                        path.setAttribute("id", "edge-" + r.person.id + "-" + person.id);
                        if (r.person.data.Gender == "Male") {
                            path.classList.add("father");
                        } else if (r.person.data.Gender == "Female") {
                            path.classList.add("mother");
                        } else {
                            path.classList.add("parent");
                        }
                    } else if (r.rel == "spouse" && person.ty < r.person.ty) {
                        path = document.createElementNS(SVG, "path");
                        path.setAttribute("id", "edge-" + r.person.id + "-" + person.id);
                        if (r.type == "inferred") {
                            path.classList.add("coparent");
                        } else {
                            path.classList.add("marriage");
                        }
                    }
                    if (path) {
                        if (r.type) {
                            path.classList.add(r.type);
                        }
                        edges.appendChild(path);
                        path.person0 = person;
                        path.person1 = r.person;
                        if (person == focus || r.person == focus) {
                            path.classList.add("focus");
                            focusedges.push(path);
                        }
                    }
                }
            }
            for (const marriage of marriages) {
                const person = marriage.a;
                const spouse = marriage.b;
                for (const r of person.relations) {
                    if (r.rel == "spouse" && r.person == spouse && r.type != "inferred" && r.date) {
                        let text = document.createElementNS(SVG, "text");
                        text.appendChild(document.createTextNode(this.formatDate(r.date)));
                        text.classList.add("marriage");
                        text.setAttribute("id", "label-" + person.id + "-" + spouse.id);
                        labels.appendChild(text);
                        // Don't really have a good idea to display multiple spouses,
                        // at the moment it looks like each spouse marries the next one.
                        text.person0 = marriage.top;
                        text.person1 = marriage.bot;
                        if (person == focus || r.person == focus) {
                            text.classList.add("focus");
                        }
                    }
                }
            }
        }
        for (let path of focusedges) {
            edges.appendChild(path);        // Focused edges go last
        }
        this.#refocusStart = Date.now();          // Begin our animation
        this.#refocusEnd = Date.now() + 1000;
        this.focus = focus;
        this.view.cx0 = this.view.cx;
        this.view.cy0 = this.view.cy;
        this.view.callback = callback;
        this.view.peopleLength = this.people.length;
        window.requestAnimationFrame(() => { this.draw(); });
    }

    /**
     * Sort people into priority order based on focus.
     * Also assigns them to a generation.
     * @param focus the focal node
     * @param people the list of people
     */
    order(focus, people) {
        let q = [];
        // Nodes are hidden if they have no name
        // Everything is hidden unless reachable from a non-hidden node
        // Possible for nephews to marry aunts, etc, so even generations need a focus.
        for (const person of people) {
            person.hidden = true;
            person.ty = person.tx = person.generation = NaN;
        }
        q.push(focus);
        focus.generation = 0;
        let mingen = 0;
        for (let i=0;i<q.length;i++) {
            const person = q[i];
            person.hidden = false;
            mingen = Math.min(mingen, person.generation);
            for (let spouse of person.spouses()) {
                if (!spouse.isHidden() && !q.includes(spouse)) {
                    spouse.generation = person.generation;
                    q.push(spouse);
                }
            }
            for (let child of person.children()) {
                if (!child.isHidden() && !q.includes(child)) {
                    child.generation = person.generation + 1;
                    q.push(child);
                    for (let spouse of child.spouses()) {
                        if (!spouse.isHidden() && !q.includes(spouse)) {
                            spouse.generation = person.generation + 1;
                            q.push(spouse);
                        }
                    }
                }
            }
            for (let par of person.parents()) {
                if (!par.isHidden() && !q.includes(par)) {
                    par.generation = person.generation - 1;
                    q.push(par);
                    for (let spouse of par.spouses()) {
                        if (!spouse.isHidden() && !q.includes(spouse)) {
                            spouse.generation = person.generation - 1;
                            q.push(spouse);
                        }
                    }
                }
            }
        }
        for (const person of people) {
            if (!person.hidden && !q.includes(person)) {
                throw new Error("missing " + person);
            } else if (person.hidden && q.includes(person)) {
                throw new Error("includes hudden " + person);
            }
        }
        for (let person of q) {
            person.generation -= mingen;
        }
        return q;
    }

    /**
     * Position all the nodes. After this method they all have "tx" and "ty" set
     * @param focus the focal node
     * @param ordered the ordered array of people in priority order
     * @param marriages an array to be populated with [{a:person, b:person, top: person, bot: person}]. The marriage between a and b is to be positioned between top and bot
     */
    placeNodes(focus, ordered, marriages) {
        const style = this.svg ? getComputedStyle(this.svg) : null;
        const MINWIDTH = style ? this.#evalLength(style, style.getPropertyValue("--min-person-width")) : 50;
        const SPOUSEMARGIN = style ? this.#evalLength(style, style.getPropertyValue("--spouse-margin")) : 10;
        const SIBLINGMARGIN = style ? this.#evalLength(style, style.getPropertyValue("--sibling-margin")) : 20;
        const OTHERMARGIN = style ? this.#evalLength(style, style.getPropertyValue("--other-margin")) : 40;
        const GENERATIONMARGIN = style ? this.#evalLength(style, style.getPropertyValue("--generation-margin")) : 100;
        const PASSES = 1000;
        const DEBUG = typeof window == "undefined";

        const genpeople = [];
        const genwidth = [];
        const forces = [];       // includes func(d) where d is vertical distance from primary to secondary (may be -ve), and ret is +ve to bring closer together
        const q = []; // tmp working aray

        // STEP 0
        // Preliminary stuff, work out the width for each generation,
        // reset some properties
        for (let person of ordered) {
            const generation = person.generation;
            if (!genpeople[generation]) {
                genpeople[generation] = [];
                genwidth[generation] = MINWIDTH;
            }
            genwidth[generation] = Math.max(genwidth[generation], person.width);
            person.clump = {
                people: [person],
                shift: 0,
                shiftCount: 0,
                toString: function() {
                    return "(" + this.people.length + " from \"" + this.people[0].presentationName() + "\" to \"" + this.people[this.people.length - 1].presentationName() + "\" shift="+(this.shift/this.shiftCount)+" from " + this.shiftCount + " gap=["+this.prevMargin+" "+this.nextMargin+"])";
                }
            };
        }

        // STEP 1
        // ------
        // Find the roots of the tree. For each node in our priority order,
        // traverse up on all branches and add any nodes that have no parents
        // that we haven't previously added.
        //
        // Store the unseen roots for each node in [roots]
        const roots = [], seen = [];
        for (let person of ordered) {
            let n = person, subroots = [];
            roots.push(subroots);
            while (q.length || n) {
                if (n != null) {
                    if (seen.includes(n)) {
                        n = null; // We have joined an already processed tree, go down again
                    } else {
                        seen.push(n);
                        const mother = n.mother && !n.mother.hidden ? n.mother : null;
                        const father = n.father && !n.father.hidden ? n.father : null;
                        if (mother) {
                            q.push(mother);
                        } else if (!father) {
                            subroots.push(n);
                        }
                        n = father;
                    }
                } else {
                    n = q.pop();
                }
            }
        }
        // STEP 2
        // The first tree we draw should ideally be the most complete, as the first one is
        // the best laid out. For now the "most complete" is simply the deepest - could
        // count descendents
        roots[0].sort((a,b) => {
            return a.generation - b.generation;
        });

        // STEP 3
        // Do the easy layout bits - we worked out the width of each generation above,
        // so give them each a width and X position. Also add a force between each
        // parent and child to forces[]
        for (const person of ordered) {
            person.genwidth = genwidth[person.generation];
            person.ty = NaN;
            person.tx = genwidth[0] / 2;
            for (let j=1;j<=person.generation;j++) {
                person.tx += (genwidth[j - 1] + genwidth[j]) / 2 + GENERATIONMARGIN;
            }
            for (const par of person.parents()) {
                if (!par.hidden) {
                    forces.push({name: "child", a: par, b: person, iterations:1, func: (d) => Math.abs(d) < 1 ? Math.abs(d) : Math.log(Math.abs(d) - 1) * 4 });
                }
            }
            if (person.svg) {
                let rect = person.svg.querySelector("rect");
                rect.setAttribute("width", person.genwidth);
                for (let text of person.svg.querySelectorAll("text")) {
                    text.setAttribute("x", Math.round(person.genwidth / 2));
                }
                person.svg.classList.toggle("focus", person == focus);
                person.svg.classList.toggle("pending", !person.isLoaded());
                person.svg.classList.remove("spouse");
            }
        }

        // STEP 4
        // Initial complex position of each person - the Y value.
        // Do this by traversing down from roots, doing a standard tree layout - conceptually
        // we have N columns, nodes are added to columns as the tree traverses, with the "y"
        // value increasing by the appropriate margin between the nodes each time. If a node
        // has children, its Y value is the maximum of that position and the center of its
        // children.
        //
        // The end result of this is a valid layout, no overlaps, but everything is squished
        // towards the top of each column.
        //
        // People are also assigned to "clumps" - a sequence of nodes in a column that move
        // together. Clumps are initially set to a node and its spouses.
        //
        let maxy = 0;
        const func = function(owner, person) {
            if (person.hidden) {
                return null;
            }
            const generation = person.generation;
            let mylast = person;
            if (!genpeople[generation].includes(person)) {
                let prev = genpeople[generation].length == 0 ? null : genpeople[generation][genpeople[generation].length - 1];
                genpeople[generation].push(person);
                let spouseheight = 0;
                // Position spouses that have not previously been positioned
                // Only position ones with the same generation. It's theoretically
                // possible for a spouse to be in a different generation, but that
                // should only happen if they've been laid out as a child of a different root
                for (const spouse of person.spouses()) {
                    if (!spouse.hidden && spouse.generation == generation && !genpeople[generation].includes(spouse)) {
                        genpeople[generation].push(spouse);
                        if (spouse.svg) {
                            spouse.svg.classList.add("spouse");
                        }
                        spouse.tx += 10;
                        marriages.push({a:person, b:spouse, top:mylast, bot: spouse});
                        mylast = spouse;
                        person.clump.people.push(spouse);
                        spouse.clump = person.clump;
                        spouseheight += spouse.height + SPOUSEMARGIN;

                    }
                }
                // Recursively position children, keeping track of first/last child.
                // As we position spouses, lastchild is quite possibly a spouse
                let firstchild = null, lastchild = null;
                for (const child of person.children()) {
                    let p = func(person, child);
                    if (p) {
                        if (!firstchild) {
                            firstchild = lastchild = p;
                        } else {
                            lastchild = p;

                        }
                    }
                }
                let y = NaN;
                if (prev) { // Y value depends on previous element
                    let rel = person.relationshipName(prev);
                    if (rel == "spouse" || rel == "spouse-spouse") {
                        y = SPOUSEMARGIN;
                        rel = "spouse";
                    } else if (rel == "sibling" || rel == "step-sibling" || rel == "sibling-in-law") {
                        y = SIBLINGMARGIN;
                        rel = "sibling";
                    } else {
                        y = OTHERMARGIN;
                        rel = null;
                    }
                    y += (prev.height + person.height) / 2;
                    person.clump.prev = prev.clump;
                    prev.clump.next = person.clump;
                    person.clump.prevMargin = prev.clump.nextMargin = y;
                    person.clump.prevRel = prev.clump.nextRel = rel;
                    y += prev.ty;
                }
                if (firstchild) { // Y value also derived from mid-point of children
                    let midy = (firstchild.ty + lastchild.ty - spouseheight) / 2;
                    if (isNaN(y)) {
                        // This is first item in column, position based on children
                        y = midy;
                    } else if (midy > y) {
                        // Midpoint of children is lower than our minimum position.
                        // Move our position down to their midpoint.
                        y = midy;
                    }
                }
                if (isNaN(y)) { // No previous element, no children
                    y = person.height / 2;
                }
                person.ty = y;
                if (isNaN(person.ty)) { console.log(person); throw new Error("NAN"); }
                // Node is positioned, now position spouses relative to this node.
                prev = person;
                for (const spouse of person.clump.people) {
                    if (spouse != person) {
                        const distance = (prev.height + spouse.height) / 2 + SPOUSEMARGIN;
                        y += distance;
                        spouse.ty = y;
                    }
                }
                if (y > maxy) {
                    maxy = y;
                }
                return mylast;  // return here to position nodes WRT to all children, including those owned by other nodes
            } else {
                // This node has been positioned, but traverse children anyway as
                // this node might have been positioned as another's spouse, and
                // have different children to the spouse.
                for (const child of person.children()) {
                    func(person, child);
                }
            }
            return null;
        };
        // Traverse each tree from each root
        for (let subroot of roots) {
            for (let root of subroot) {
                func(null, root);
            }
        }
        if (DEBUG) console.log("MAXY="+maxy);
        for (const person of ordered) {
            if (!person.hidden && isNaN(person.ty)) { console.log(person); throw new Error("NAN"); }
            if (person.ty < -0.01 || person.ty > maxy + 0.01) {
                console.log(person);
                throw new Error();
            }
        }

        // STEP 5
        // Layout is valid but we can improve it by doing a force layout between parents
        // and children to pull things to the center.
        //
        // That's the theory. In practice this algorithm is absolute hell. After many iterations
        // the algorithm is:
        //  * calculate the forces on each "clump" as the average of the pull between nodes.
        //  * for each column, see if moving a clump would collide with another clump? If it
        //    would, merge those clumps and repeat.
        //
        for (let pass=0;pass<PASSES;pass++) {
            let maxdy = 0;
            if (DEBUG) console.log("pass " + pass);
            for (const f of forces) {
                const oa = f.a.ty + (f.a.clump.shiftCount == 0 ? 0 : f.a.clump.shift / f.a.clump.shiftCount);
                const ob = f.b.ty + (f.b.clump.shiftCount == 0 ? 0 : f.b.clump.shift / f.b.clump.shiftCount);
                const distance = oa - ob;  // +ve if a is lower
                const sign = Math.sign(distance);
                let force = f.func(distance); // +ve if closer together
                if (DEBUG) console.log("  f="+f.name+" a="+f.a+"@"+oa+" b="+f.b+"@"+ob+" d="+distance+" f="+force+"*"+sign);
                f.a.clump.shift -= force * sign;
                f.a.clump.shiftCount++;
                f.b.clump.shift += force * sign;
                f.b.clump.shiftCount++;
            }
            for (let a of genpeople) {
                const MAXREPEAT = 1000; // just in case
                for (let repeat=0;repeat < MAXREPEAT;repeat++) {
                    let repeatNeeded = false;
                    let numclumps = 0;
                    for (let clump = a[0].clump;clump;clump=clump.next) {
                        clump.index = numclumps++;
                    }
                    if (DEBUG) console.log("  column " + genpeople.indexOf(a) + " has " + numclumps + " clumps");
                    for (let clump = a[0].clump;clump;clump=clump.next) {
                        const prev = clump.prev;
                        const next = clump.next;
                        let dy = clump.shift / clump.shiftCount;
                        if (dy < 0) {
                            const y = clump.people[0].ty;
                            const gap = clump.prevMargin;
                            if (prev) {
                                let prevy = prev.people[prev.people.length - 1].ty;
                                let prevdy = prev.shift / prev.shiftCount;
                                let overlap = (prevy + prevdy + gap) - (y + dy) 
                                if (overlap > 0) {  // Shift up collides
                                    dy = prevy - y + gap;
                                    if (DEBUG) console.log("      clump #" + clump.index + clump + ",top="+y+" overlaps prev " + prev + ",bot="+(prevy+prevdy)+"+"+gap+"  by " + overlap + ", moving by " + dy + " and merging up");
                                    for (const person of clump.people) {
                                        person.ty += dy;
                                        person.clump = prev;
                                    }
                                    prev.people = prev.people.concat(clump.people);
                                    prev.shift += clump.shift;
                                    prev.shiftCount += clump.shiftCount;
                                    prev.next = next;
                                    if (next) {
                                        next.prev = prev;
                                    }
                                    repeatNeeded = true;
                                } else {
                                    if (DEBUG) console.log("      clump #" + clump.index + clump + ",top="+y+" has no overlap");
                                }
                            } else if (y + dy < 0) {
                                let v = clump.shift * (y - 0) / -dy;
                                if (DEBUG) console.log("      clump #" + clump.index + clump + ",top="+y+" hits min=0, reducing shift to " + (v / clump.shiftCount));
                                clump.shift = v;
                            }
                        } else if (dy > 0) {
                            const y = clump.people[clump.people.length - 1].ty;
                            const gap = clump.nextMargin;
                            let dy = clump.shift / clump.shiftCount;
                            if (next) {
                                let nexty = next.people[0].ty;
                                let nextdy = next.shift / next.shiftCount;
                                let overlap = (y + dy) - (nexty + nextdy - gap);
                                if (overlap > 0) {  // Shift down collides
                                    dy = nexty - y - gap;
                                    if (DEBUG) console.log("      clump #" + clump.index + clump + ",bot="+y+" overlaps next " + next + ",top="+(nexty+nextdy)+"-"+gap+"  by " + overlap + ", moving by " + dy + " and merging down");
                                    for (const person of clump.people) {
                                        person.ty += dy;
                                        person.clump = next;
                                    }
                                    next.people = clump.people.concat(next.people);
                                    next.shift += clump.shift;
                                    next.shiftCount += clump.shiftCount;
                                    next.prev = prev;
                                    if (prev) {
                                        prev.next = next;
                                    }
                                    repeatNeeded = true;
                                } else {
                                    if (DEBUG) console.log("      clump #" + clump.index + clump + ",bot="+y+" has no overlap: y="+y+"+"+dy+" next.y="+nexty+"+"+nextdy+" gap="+gap+" ol="+overlap);
                                }
                            } else if (y + dy > maxy) {
                                let v = clump.shift * (maxy - y) / dy;
                                if (DEBUG) console.log("      clump #" + clump.index + clump + ",bot="+y+" hits max="+maxy+", reducing shift to " + (v / clump.shiftCount));
                                clump.shift = v;
                                repeatNeeded = true;
                            }
                        } else {
                            if (DEBUG) console.log("      clump #" + clump.index + clump + " has no shift");
                        }
                    }
                    if (!repeatNeeded) {
                        break;
                    }
                }
                let i = 0;
                for (let clump = a[0].clump;clump;clump=clump.next) {
                    clump.index = i++;
                    let dy = clump.shift / clump.shiftCount;
                    maxdy = Math.max(Math.abs(dy), maxdy);
                    if (DEBUG) console.log("    clump #" + clump.index + clump + " moving by " + dy);
                    for (const person of clump.people) {
                        person.ty += dy;
                    }
                    clump.shift = clump.shiftCount = 0;
                }
            }
            if (maxdy < 1) {
                pass = PASSES;
            }
        }
    }

    /**
     * Redraw. This is the animation frame, don't repeat work here
     */
    draw() {
        const edges = this.svg.querySelector(".relations");
        const labels = this.svg.querySelector(".labels");

        // T from 0..1 depending on how far through animation we are
        let t = (Date.now() - this.#refocusStart) / (this.#refocusEnd - this.#refocusStart);
        if (t < 0) {
            return;
        } else if (t >= 1) {
            t = 1;
        } else {
            window.requestAnimationFrame(() => { this.draw() });
        }
        t = t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;  // Simple cubic bezier easing

        let x0 = null, x1, y0, y1;
        for (let i=0;i<this.view.peopleLength;i++) {
            const person = this.people[i];
            if (!person.hidden) {
                person.cx = person.x + (person.tx - person.x) * t;
                person.cy = person.y + (person.ty - person.y) * t;
                if (t == 1) {
                    person.x = person.tx;
                    person.y = person.ty;
                }
        //        console.log("  tick: " + i + " " + person.relations.length);
                let x = Math.round(person.cx);
                let y = Math.round(person.cy);
                let w = Math.round(person.genwidth / 2);
                let h = Math.round(person.height / 2);
                x -= w;
                y -= h;
                person.svg.setAttribute("transform", "translate(" + x + " " + y + ")");
                if (x0 == null) {
                    x0 = x;
                    y0 = y;
                    x1 = x + w*2;
                    y1 = y + h*2;
                } else {
                    x0 = Math.min(x0, x);
                    y0 = Math.min(y0, y);
                    x1 = Math.max(x1, x + w*2);
                    y1 = Math.max(y1, y + h*2);
                }
            }
        }
        for (let path=edges.firstElementChild;path;path=path.nextElementSibling) {
            const p0 = path.person0;
            const p1 = path.person1;
            let px0, py0, px1, py1, px2, py2, px3, py3;
            if (path.classList.contains("marriage") || path.classList.contains("coparent")) {
                let edge = p0.cx < p1.cx ? -1 : 1;
                px0 = Math.round(p0.cx) + p0.genwidth * 0.5 * edge;
                py0 = Math.round(p0.cy) + p0.height   * 0;
                px3 = Math.round(p1.cx) + p1.genwidth * 0.5 * edge;
                py3 = Math.round(p1.cy) + p1.height   * 0;
                px1 = (edge < 0 ? Math.min(px0, px3) : Math.max(px0, px3)) + 10 * edge;
                py1 = py0;
                px2 = px1;
                py2 = py3;
            } else {
                px0 = Math.round(p0.cx) + p0.genwidth * -0.5;
                py0 = Math.round(p0.cy) + p0.height   * 0;
                px3 = Math.round(p1.cx) + p1.genwidth * 0.5;
                py3 = Math.round(p1.cy) + p1.height   * 0;
                px1 = px0 + (px3 - px0) / 2;
                py1 = py0;
                px2 = px0 + (px3 - px0) / 2;
                py2 = py3;
            }
            let d = "M " + px0 + " " + py0 + " C " + px1 + " " + py1 + " " + px2 + " " + py2 + " " + px3 + " " + py3;
            path.setAttribute("d", d);
        }
        for (let label=labels.firstElementChild;label;label=label.nextElementSibling) {
            const p0 = label.person0;
            const p1 = label.person1;
            let cx = Math.round(Math.min(p0.cx - p0.genwidth * 0.5,  p1.cx - p0.genwidth * 0.5));
            label.classList.add("left");
            let cy = Math.round(p0.cy + p1.cy) / 2;
            label.setAttribute("x", cx);
            label.setAttribute("y", cy);
        }
        let cx, cy;
        if (this.people.length) {
            cx = this.view.cx0 + (this.focus.tx - this.view.cx0) * t;
            cy = this.view.cy0 + (this.focus.ty - this.view.cy0) * t;
        }
        this.reposition({x0:x0, y0:y0, x1:x1, y1:y1, cx:cx, cy:cy});
        if (t == 1 && this.view.callback) {
            setTimeout(() => { this.view.callback(); }, 0);
        }

    }

    dump() {
        let a = [];
        for (const person of this.people) {
            if (person.isLoaded()) {
                person.data.Id = person.id;
                if (person == this.focus) {
                    a.unshift(person.data);
                } else {
                    a.push(person.data);
                }
            }
        }
        console.log(JSON.stringify(a));
    };

    formatDate(date, state) {
        if (!date || date == "9999") {
            return null;
        } else if (date.endsWith("-00-00")) {
            date = date.substring(0, 4);
        } else if (date.endsWith("-00")) {
            date = date.substring(0, date.length - 2) + "27";
            date = new Intl.DateTimeFormat(undefined , { dateStyle: "medium", }).format(Date.parse(date));
            date = date.replace(/\b27[,]?\s*/, "");
        } else {
            date = new Intl.DateTimeFormat(undefined , { dateStyle: "medium", }).format(Date.parse(date));
        }
        if (state == "guess") {
            date = "c" + date;
        } else if (state == "before") {
            date = "\u2264" + date;
        } else if (state == "after") {
            date = "\u2265" + date;
        }
        return date;
    }

    /**
     * Find a person record for the specified ID, creating it if necessary
     * @param id the numeric id of a person, although a name (eg "Windsor-1") will also work for existing ids
     */
    find(id) {
        if (typeof id == "number") {
            id = id.toString();
        } else if (typeof id != "string") {
            throw new Error("bad argument");
        }
        let person = this.byid[id]; 
        if (!person) {
            person = new Person(this, this.people.length, id);
            this.byid[id] = person;
            this.people.push(person);
        }
        return person;
    }

    /**
     * Load people.
     * @param the params to merge over the API call
     * @param callback the method to call once the people are loaded
     */
    load(params, callback) {
        let usedparams = {
            action: "getPeople",
            fields: [ "Name", "FirstName", "MiddleName", "LastNameAtBirth", "LastNameCurrent", "Suffix", "BirthDate", "DeathDate", "Gender", "DataStatus", "IsLiving", "IsMember", "Privacy", "Spouses", "HasChildren", "Father", "Mother" ],
            "appid": "Mike's Slippy Tree"
        };
        for (let key in params) {
            usedparams[key] = params[key];
        }
        let qs = "";
        for (let key in usedparams) {
            qs += (qs.length == 0 ? '?' : '&');
            qs += encodeURIComponent(key) + "=";
            let val = usedparams[key];
            if (Array.isArray(val)) {
                for (let i=0;i<val.length;i++) {
                    if (i > 0) {
                        qs += ",";
                    }
                    qs += encodeURIComponent(val[i]);
                }
            } else {
                qs += encodeURIComponent(val);
            }
        }
        const url = APIURL + qs;
        console.log("Load " + url);
        fetch(url, { credentials: "include" })
            .then(x => x.json())
            .then(data => {
                const len = this.people.length;
                if (data[0].people) {
                    let newpeople = [];
                    for (const id in data[0].people) {
                        const r = data[0].people[id];
                        if (parseInt(id) > 0) {
                            const person = this.find(id);
                            person.load(data[0].people[id]);
                            newpeople.push(person);
                        }
                    }
                    for (const person of newpeople) {
                        for (const key of ["Father", "Mother"]) {
                            const id2 = person.data[key];
                            if (id2) {
                                const other = this.find(id2);
                                let certainty = person.data.DataStatus[key];
                                switch (certainty) {
                                    case "30": certainty = "dna"; break;
                                    case "20": certainty = "confident"; break;
                                    case "10": certainty = "uncertain"; break;
                                    case "5": certainty = "nonbiological"; break;
                                    default: certainty = null;
                                }
                                person.link(key == "Father" ? "father" : "mother", other, certainty);
                            }
                        }
                        if (person.father && person.mother) {
                            person.father.link("spouse", person.mother, "inferred", person.data.BirthDate);
                        }
                        for (const r of person.data.Spouses) {
                            const id2 = r.Id.toString();
                            const other = this.find(id2);
                            let certainty = r.DataStatus.MarriageDate;
                            if (certainty == "") {
                                certainty = null;
                            }
                            let date = r.MarriageDate;
                            person.link("spouse", other, certainty, date);
                        }
                    }
                }
                if (callback) {
                    callback();
                }
            });
    }

    /**
     * Convert an {x:n, y:n} with pixel coordinates relative to the SVG element to logical coordinates
     */
    toSVGCoords(point) {
        let x = point.x;
        let y = point.y;
        x = ((x - this.view.padx0) / this.view.scale) + this.view.x0;
        y = ((y - this.view.pady0) / this.view.scale) + this.view.y0;
        return {x:x, y:y};
    }

    /**
     * Convert an {x:n, y:n} with logical coordinates to pixel coordinates relative to the SVG element
     */
    fromSVGCoords(point) {
        let x = point.x;
        let y = point.y;
        x = (x - this.view.x0) * this.view.scale + this.view.padx0;
        y = (y - this.view.y0) * this.view.scale + this.view.pady0;
        return {x:x, y:y};
    }

    /**
     * Evalate a CSS length in a specific context.
     * @param style the style
     * @param length the length value, eg "8px"
     */
    #evalLength(style, length) {
        // Cheat. Just do pixels for now
        return length.replace(/px$/, "") * 1;
    }

}

/**
 * The Person object.
 */
class Person {
    // Duplicated content and probably junk in here, could certainly be trimmed

    constructor(tree, index, id) {
        this.tree = tree
        this.index = index;  // local index into array
        this.id = id;        // unique number from wikitree
        this.data = {};
        this.relations = [];
    }

    load(data) {
        this.pruned = false;
        let changed = false;
        for (let key in data) {
            if (!this.data[key]) {
                let val = data[key];
                if ((key == "BirthDate" || key == "DeathDate") && val == "0000-00-00") {
                    val = "9999";
                }
                this.data[key] = val;
                changed = true;
            }
        }
        if (data.Name && !this.tree.byid[data.Name]) {
            this.tree.byid[data.Name] = this;
        }
        if (changed) {
            if (this.svg) {
                this.svg.remove();
                delete this.svg;        // So its rebuilt
            }
        }
    }

    /**
     * Should we not display this person?
     */
    isHidden() {
        return !this.data.Name || this.pruned;
    }

    /**
     * Is this person loaded? "Loaded" just means we have core details, it doesn't mean we know all its relations
     */
    isLoaded() {
        return this.data.Name;
    }

    toString() {
        let out = "\"";
        out += this.id;
        if (this.data.Name) {
            out += " " + this.data.Name;
        }
        out += " " +this.presentationName()+" "+this.presentationExtra();
        out += "\"";
        return out;
    };

    presentationName() {
        if (!this.data.Name) {
            return "Unloaded";
        }
        let out = "";
        if (this.data.FirstName) {
            out += this.data.FirstName;
        } else {
            out += "Unknown";
        }
        if (this.data.MiddleName) {
            out += " " + this.data.MiddleName;
        }
        if (this.data.LastNameAtBirth != this.data.LastNameCurrent) {
            out += " (" + this.data.LastNameAtBirth + ")";
        }
        out += " " + this.data.LastNameCurrent;
        return out;
    }

    presentationExtra() {
        let out = "";
        let birthDate = this.tree.formatDate(this.data.BirthDate, this.data.DataStatus ? this.data.DataStatus.BirthDate : null);
        let deathDate = this.tree.formatDate(this.data.DeathDate, this.data.DataStatus ? this.data.DataStatus.DeathDate : null);
        if (birthDate && deathDate) {
            out += " (" + birthDate + " - " + deathDate + ")";
        } else if (birthDate) {
            out += " (" + birthDate + ")";
        } else if (deathDate) {
            out += " (- " + deathDate + ")";
        }
        return out;
    }

    /**
     * Add a relation
     * @param rel "father", "mother" or "spouse" (note "children" and "sibling" are also called, but internally)
     * @param person the other person
     * @param type the certainty to add to the relationship - "inferred" being a weak presumption of marriage between parents
     * @param date for spouses the marriage date
     */
    link(rel, person, type, date) {
        if (!person) {
            throw Error("person is null");
        }
        if (rel == "sibling" || rel == "child") {
            date = person.data.BirthDate;
        } else if (rel == "father") {
            date = this.data.BirthDate;
            this.father = person;
            this.father_certainty = type;
            rel = "parent";
        } else if (rel == "mother") {
            date = this.data.BirthDate;
            this.mother = person;
            this.mother_certainty = type;
            rel = "parent";
        } else if (rel != "spouse") {
            throw new Error("Unknown relation " + rel);
        }
        if (date == "0000" || date == "0000-00-00") {
            date = null;
        }
        // console.log("Link " + this + " " + rel + " " + person);
        let add = true, changed = false;
        for (let i=0;i<this.relations.length;i++) {
            const r = this.relations[i];
            if (r.person == person && r.rel == rel) {
                if ((r.date != date || r.type != type) && (type != "inferred" || date < r.date)) {
                    r.date = date;
                    r.type = type;
                    changed = true;
                }
                add = false;
                break;
            }
        }
        if (add) {
            this.relations.push({rel:rel, person:person, date:date, type:type });
            changed = true;
        }
        if (changed) {
            this.relations.sort((a,b) => {
                if (a.date && b.date) {
                    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;
                } else if (a.date) {
                    return -1;
                } else if (b.date) {
                    return 1;
                } else {
                    return a.id - b.id;
                }
            });
            if (rel == "parent") {
                person.link("child", this, type);
                for (let sibling of person.children()) {
                    if (sibling != this) {
                        this.link("sibling", sibling);
                        sibling.link("sibling", this);
                    }
                }
            } else if (rel == "spouse") {
                person.link("spouse", this, type, date);
            }
        }
    }

    // Iterators for relations

    *children() {
        for (const r of this.relations) {
            if (r.rel == "child") {
                yield r.person;
            }
        }
    };

    *parents() {
        for (const r of this.relations) {
            if (r.rel == "parent") {
                yield r.person;
            }
        }
    };

    *spouses() {
        for (const r of this.relations) {
            if (r.rel == "spouse") {
                yield r.person;
            }
        }
    };

    *siblings() {        // Does not include self
        for (const r of this.relations) {
            if (r.rel == "sibling") {
                yield r.person;
            }
        }
    };

    /**
     * Return one of "parent", "child", "spouse", "child-inlaw", "spouse-inlaw", "parent-in-law", "step-child", "step-parent", "spouse-spouse" (ie spouse's other spouse), "sibling-in-law", "uncle/aunt', "nephew/niece"
     */
    relationshipName(other) {
        let out = null;
        if (other) {
            for (let r of this.relations) {
                if (r.person == other) {
                    out = r.rel;
                }
                if (out) break;
            }
            if (!out) {
                for (let r of this.relations) {
                    for (let r2 of r.person.relations) {
                        if (r2.person == other) {
                            if (r.rel == "spouse") {  // relative of my spouse
                                out = r2.rel == "child" ? "step-child" : r2.rel == "parent" ? "parent-in-law" : r2.rel == "sibling" ? "sibling-in-law" : "spouse-spouse";
                            } else if (r.rel == "parent") {  // relative of my parent
                                out = r2.rel == "child" ? "sibling" : r2.rel == "parent" ? "grand-parent" : r2.rel == "sibling" ? "uncle/aunt" : "parent-in-law";
                            } else if (r.rel == "child") {  // relative of my child
                                out = r2.rel == "child" ? "grand-child" : r2.rel == "parent" ? "spouse" : r2.rel == "sibling" ? "step-child" : "child-in-law";
                            } else if (r.rel == "sibling") {  // relative of my sibling
                                out = r2.rel == "child" ? "nephew/niece" : r2.rel == "parent" ? "step-parent" : r2.rel == "sibling" ? "sibling" : "sibling-in-law";
                                // child's parent is technically "co-parent" but we've already presumed spouse when record was created
                            }
                        }
                        if (out) break;
                    }
                    if (out) break;
                }
            }
        }
        return out;
    }

    /**
     * Execute a popupmenu action for this person
     * @param name the name of the action
     */
    action(name) {
        console.log("Action " + name + " on " + this);
        if (name == "focus") {
            // Refocus the tree on this node
            this.tree.refocus(this);

        } else if (name == "nuclear") {
            // Load the "nuclear" family for this node
            this.tree.load({keys: this.id, nuclear:1}, () => { this.tree.refocus(this); });

        } else if (name == "ancestors") {
            // Load 4 (the max) levels of ancestors for this node
            this.tree.load({keys: this.id, ancestors:4}, () => { this.tree.refocus(this); });

        } else if (name == "descendants") {
            // Load 4 (the max) levels of descendants for this node, and their spouses. Multi stage.
            // Load ...
            this.tree.load({keys: this.id, descendants:4}, () => {
                // ... focus ...
                this.tree.refocus(this, () => {
                    // ... then load their unloaded spouses ...
                    let q = [];
                    q.push(this);
                    const func = function(person) {
                        if (!person.isHidden()) {
                            for (const child of person.children()) {
                                q.push(child);
                                func(child);
                            }
                        }
                    };
                    func(this);
                    let spouses = [];
                    for (let person of q) {
                        for (const spouse of person.spouses()) {
                            if (!spouse.isLoaded()) {
                                spouse.growFrom = person;
                                spouses.push(spouse.id);
                            }
                        }
                    }
                    this.tree.load({keys: spouses}, () => {
                        // ... then focus again
                        this.tree.refocus(this);
                    });
                });
            });
        } else if (name == "prune") {
            // Mark as pruned any nodes not reachable as a parent,
            // descendant, or spouse of a descendant
            for (const person of this.tree.people) {
                person.pruned = false;
            }
            const q = [];
            q.push(this);
            for (let i=0;i<q.length;i++) {
                const person = q[i];
                if (person.mother && !person.mother.isHidden()) {
                    q.push(person.mother);
                }
                if (person.father && !person.father.isHidden()) {
                    q.push(person.father);
                }
            }
            const func = function(person) {
                if (!person.isHidden()) {
                    for (const child of person.children()) {
                        q.push(child);
                        func(child);
                    }
                }
            };
            func(this);
            for (let i=q.length-1;i>=0;i--) {
                const person = q[i];
                for (const spouse of person.spouses()) {
                    if (!spouse.isHidden()) {
                        q.push(spouse);
                    }
                }
            }
            for (const person of this.tree.people) {
                person.pruned = !q.includes(person);
            }
            this.tree.refocus(this);
        }
    }
}

function main() {
    // For command line testing.
    const fs = require("node:fs");
    let a = JSON.parse(fs.readFileSync(0))
    const tree = new SlippyTree({ });
    for (let x of a) {
        const person = tree.find(x.Id);
        person.load(x);
    }
    for (const person of tree.people) {
        if (person.data.Father && tree.byid[person.data.Father.toString()]) {
            person.link("father", tree.find(person.data.Father));
        }
        if (person.data.Mother && tree.byid[person.data.Mother.toString()]) {
            person.link("mother", tree.find(person.data.Mother));
        }
        for (let s of person.data.Spouses) {
            if (tree.byid[s.Id.toString()]) {
                person.link("spouse", tree.find(s.Id.toString()), null, s.MarriageDate);
            }
        }
    }
    tree.refocus(tree.people[0]);
}
if (typeof window == "undefined") {
    main();
} else {
    window.addEventListener("DOMContentLoaded", initialize);
}


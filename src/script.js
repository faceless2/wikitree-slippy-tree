"use strict";

const APIURL = "https://api.wikitree.com/api.php";
const APPID = "MikesSlippyTree";
const DEMOID = "Windsor-1";
const SVG = "http://www.w3.org/2000/svg";
const MINSCALE = 0.5, MAXSCALE = 2.5;

/**
 * This is the entry point
 */
function initialize(svg) {
    const tree = new SlippyTree({
        element: "#scrollpane",
        menu: "#personmenu",
        refocusOnClick: true
    });
    window.tree = tree;

    login();

    const idField = document.getElementById("idField");
    const loadButton = document.getElementById("loadButton");
    const loginButton = document.getElementById("loginButton");
    const logoutButton = document.getElementById("logoutButton");
    const expandButton = document.getElementById("expandButton");
    const helpButton = document.getElementById("helpButton");
    const helpContainer = document.getElementById("helpContainer");

    idField.addEventListener("change", (e) => {
        loadButton.disabled = e.target.trim().length == 0;
    });
    idField.addEventListener("keypress", (e) => {
        loadButton.disabled = e.target.value.trim().length == 0;
        if (e.keyCode == 13) {
            e.preventDefault();
            loadButton.click();
        }
    });
    loadButton.addEventListener("click", (e) => {
        helpContainer.classList.add("hidden");
        let key = idField.value.trim();
        tree.reset();
        tree.load({keys:key,nuclear:1}, () => {
            tree.refocus(tree.byid[key]);
        });
    });
    helpButton.addEventListener("click", (e) => {
        helpContainer.classList.remove("hidden");
    });
    helpContainer.addEventListener("click", (e) => {
        helpContainer.classList.add("hidden");
    });
    loginButton.addEventListener("click", (e) => { login(true); });
    logoutButton.addEventListener("click", (e) => { login(false); });
    window.addEventListener("resize", (e) => { tree.rescale({}); });

    let key = new URLSearchParams(window.location.search).get("key");
    if (key) {
        id.value = key.trim();
        loadButton.click();
    }
}

/**
 * Evalate a CSS length in a specific context.
 * @param style the style
 * @param length the length value, eg "8px"
 */
function evalLength(style, length) {
    // Cheat. Just do pixels for now
    return length.replace(/px$/, "") * 1;
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
    const logoutButton = document.getElementById("logoutButton");
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
        if (username) {
            loginButton.classList.add("hidden");
            logoutButton.classList.remove("hidden");
            logoutButton.innerHTML = "Logout " + username;
            if (idField.value.length == 0) {
                idField.value = username;
            }
        } else {
            loginButton.classList.remove("hidden");
            logoutButton.classList.add("hidden");
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

    constructor(props) {
        this.props = props;
        this.scrollPane = typeof props.element == "string" ? document.querySelector(props.element) : props.element;
        this.personMenu = typeof props.menu == "string" ? document.querySelector(props.menu) : props.menu;
//        while (this.scrollPane.firstChild) {
//            this.scrollPane.firstChild.remove();
//        }
        if (this.personMenu) {
            this.scrollPane.appendChild(this.personMenu);
            for (let elt of this.personMenu.querySelectorAll("[data-action]")) {
                elt.addEventListener("click", () => {
                    this.personMenu.classList.add("hidden");
                    this.personMenu.person.action(elt.getAttribute("data-action"));
                });
            }
        }
        this.trackpad = false;
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

        this.people = [];
        this.byid = {};
        this.scale = {scale: 1, cx:0, cy: 0};
        this.focus = null;
        this.refocusStart = null;
        this.refocusEnd = null;

        this.scrollPane.addEventListener("scroll", () => {
            this.scale.cx = (this.scrollPane.clientWidth / 2 + this.scrollPane.scrollLeft) / this.scale.scale;
            this.scale.cy = (this.scrollPane.clientHeight / 2 + this.scrollPane.scrollTop) / this.scale.scale;
        });

        const pointers = [];
        // Quick click/release with one point: click on person
        // Long click with one pointer: popup
        // Remember: clientX is relative to the SCROLLPANE
        this.svg.addEventListener("pointerdown", (e) => {
            pointers.push({ ox:e.offsetX, oy:e.offsetY, x:e.offsetX, y:e.offsetY, id:e.pointerId });
            this.personMenu.classList.add("hidden");

            let mp = {x:e.offsetX, y:e.offsetY};
            let sp = this.toSVGCoords(mp);
            let msp = this.fromSVGCoords(sp);
//            console.log(e);
//            console.log("TGT: mouse="+JSON.stringify(mp)+" svg="+JSON.stringify(sp)+" mp2="+JSON.stringify(msp));
//            const target = document.getElementById("target");
//            target.style.left = msp.x + "px";
//            target.style.top = msp.y + "px";
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
            let x = e.offsetX;
            let y = e.offsetY;
            let oscale = this.scale.scale;
            if (pointers.length == 1) {
                let elt = document.elementFromPoint(e.pageX, e.pageY);
                if (elt == this.svg) {    // Drag scroll with one finger if over background
                    console.log(e);
                    let dx = e.movementX;
                    let dy = e.movementY;
                    let ocx = this.scale.cx;
                    let ocy = this.scale.cy;
                    let ncx = ocx - dx / oscale;
                    let ncy = ocy - dy / oscale;
//                    console.log("MOVE: " + JSON.stringify(pointers)+" dx="+dx+"/"+dy);
                    this.rescale({cx:ncx, cy:ncy});
                    pointers[0].x = x;
                    pointers[0].y = y;
                }
            } else if (pointers.length == 2) {
                for (let i=0;i<pointers.length;i++) {
                    if (pointers[i].id == e.pointerId) {
                        let ox0 = pointers[0].x;
                        let oy0 = pointers[0].y;
                        let ox1 = pointers[1].x;
                        let oy1 = pointers[1].y;
                        let nx0 = i==0 ? x : ox0;
                        let ny0 = i==0 ? y : oy0;
                        let nx1 = i==1 ? x: ox1;
                        let ny1 = i==1 ? y: oy1;
                        let od = Math.sqrt((ox1-ox0)*(ox1-ox0) + (oy1-oy0)*(oy1-oy0));
                        let nd = Math.sqrt((nx1-nx0)*(nx1-nx0) + (ny1-ny0)*(ny1-ny0));
                        let nscale = oscale * nd / od;
                        let dx = ((nx1-ox1)+(nx0-ox0)) / 2;
                        let dy = ((ny1-oy1)+(ny0-oy0)) / 2;
                        let ocx = this.scale.cx;
                        let ocy = this.scale.cy;
                        let ncx = ocx - dx / oscale;
                        let ncy = ocy - dy / oscale;
//                        console.log("old=[["+ox0+" "+oy0+"] ["+ox1+" "+oy1+"]] new=[["+nx0+" "+ny0+"] ["+nx1+" "+ny1+"]] dx=["+dx+" "+dy+"]")
                        this.rescale({scale:nscale, cx:ncx, cy:ncy});
                        pointers[0].x = nx0;
                        pointers[0].y = ny0;
                        pointers[1].x = nx1;
                        pointers[1].y = ny1;
                    }
                }
            }
        });
        this.svg.addEventListener("wheel", (e) => {
            // If a trackpad, mousewheel will run in two directions and ctrl-wheel
            // is used to pinch-zoom. If a normal mousewheel, wheel is used to zoom
            // and only goes in one direction.
            // Assume non-trackpad until proved otherwise
            e.preventDefault();
            let scale = {scale: this.scale.scale, cx:this.scale.cx, cy:this.scale.cy};
            if (e.deltaX || !Number.isInteger(e.deltaY)) {
                this.trackpad = true;
            }
            if (this.trackpad) {
                if (e.ctrlKey) {
                    scale.scale -= e.deltaY * 0.01;
                } else {
                    scale.cx -= e.deltaX / scale.scale;
                    scale.cy -= e.deltaY / scale.scale;
                }
            } else {
                scale.scale -= e.deltaY * 0.01;
            }
            this.rescale(scale);
        });
    }

    toSVGCoords(point) {
        let x = point.x;
        let y = point.y;
        x = ((x - this.scale.left) / this.scale.scale) + this.scale.x0;
        y = ((y - this.scale.top) / this.scale.scale) + this.scale.y0;
        return {x:x, y:y};
    }
    fromSVGCoords(point) {
        // svg coords 363,56 via  { left: 570.5, scale: 0.95, top: 254.5, x0: -20, y0: -13} map to screen 940px,320px
        let x = point.x;
        let y = point.y;
        x = (x - this.scale.x0) * this.scale.scale + this.scale.left;
        y = (y - this.scale.y0) * this.scale.scale + this.scale.top;
        return {x:x, y:y};
    }


    /**
     * Scale or SVG has been adjusted, resize
     * @param props a map to merge over the current scale map
     */
    rescale(m) {
        if (this.people.length == 0) {
            this.scale = {scale: 1, cx:0, cy: 0, x0:0, x1:0, y0:0, y1:0};
        } else {
            for (let key in m) {
                let v = m[key];
                if (typeof v != "number" || !isNaN(v)) {
                    this.scale[key] = m[key];
                }
            }
        }
        let o = this.scale;
        o.scale = Math.max(MINSCALE, Math.min(MAXSCALE, o.scale));
        const container = this.svg.querySelector(".container");
        const scrollpane = this.scrollPane;
        const svg = this.svg;
        const targetWidth = Math.round((o.x1 - o.x0) * o.scale);
        const targetHeight = Math.round((o.y1 - o.y0) * o.scale) + 200;
        const viewWidth = this.scrollPane.clientWidth;
        const viewHeight = this.scrollPane.clientHeight;
        const usedWidth = Math.max(viewWidth, targetWidth);
        const usedHeight = Math.max(viewHeight, targetHeight);
        o.left = (usedWidth - targetWidth) / 2;
        o.top = (usedHeight - targetHeight) / 2;
        let tran = "translate(" + o.left + " " + o.top + ") ";
        tran += "scale(" + o.scale + " " + o.scale + ") ";
        tran += "translate(" + (-o.x0) + " " + (-o.y0) + ")";
        container.setAttribute("transform", tran);
        svg.setAttribute("width", usedWidth);
        svg.setAttribute("height", usedHeight);

        const targetX = Math.round(o.cx * o.scale);
        const targetY = Math.round(o.cy * o.scale);
        let x = Math.round(targetX - viewWidth / 2);
        let y = Math.round(targetY - viewHeight / 2);
        scrollpane.scrollLeft = x;
        scrollpane.scrollTop = y;
//        console.log("RESCALE: scale="+JSON.stringify(o)+" target=["+targetWidth+" "+targetHeight+"] view=["+viewWidth+" "+viewHeight+"] center=["+targetX+" "+targetY+"] tr="+tran+" sp="+x+" "+y);
        if (!this.personMenu.classList.contains("hidden")) {
            this.showMenu();
        }
    }

    /**
     * Remove all nodes, start again
     */
    reset() {
        this.people.length = 0;
        Object.keys(this.byid).forEach(key => delete this.byid[key]);
        this.focus = this.refocusStart = this.refocusEnd = null;
        // Bit add-hoc this
        const container = this.svg.firstChild;
        for (let n=container.firstChild;n;n=n.nextSibling) {
            while (n.firstChild) {
                n.firstChild.remove();
            }
        }
    }

    showMenu(person, e) {
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
     * Called when new nodes added to the tree
     * @param focus an optional person to position the nodes on
     */
    rebuild(focus) {
        // Ensure every person has an SVG, calculate width/height
        for (const person of this.people) {
            if (!person.svg && !person.isHidden()) {
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
                    const pt = evalLength(style, style.marginTop);
                    const pr = evalLength(style, style.marginRight);
                    const pb = evalLength(style, style.marginBottom);
                    const pl = evalLength(style, style.marginLeft);
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
    }

    /**
     * Called when focal node has changed
     */
    refocus(focus, callback) {
        this.rebuild(focus);
        console.log("Focus " + focus);
        const peoplepane = this.svg.querySelector(".people");
        const edges = this.svg.querySelector(".relations");
        const labels = this.svg.querySelector(".labels");

        // First sort people into priority, then
        // position based on focus node and priority
        // After this each person has "tx" and "ty" value set
        let ordered = this.order(focus, this.people);
        this.position(focus, ordered);

        // Re-add people to SVG in priority order, and recreate edges.
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
                    } else if (r.rel == "spouse" && person.layout.spouses && person.layout.spouses.includes(r.person)) {
                        path = document.createElementNS(SVG, "path");
                        path.setAttribute("id", "edge-" + r.person.id + "-" + person.id);
                        path.classList.add("marriage");
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
            if (person.layout.spouses) {
                let lastspouse = person;
                for (const spouse of person.layout.spouses) {
                    let r;
                    for (const r2 of person.relations) {
                        if (r2.rel == "spouse" && r2.person == spouse) {
                            r = r2;
                            break;
                        }
                    }
                    if (r.rel == "spouse" && r.type != "inferred" && r.date) {
                        let text = document.createElementNS(SVG, "text");
                        text.appendChild(document.createTextNode(this.formatDate(r.date)));
                        text.classList.add("marriage");
                        text.setAttribute("id", "label-" + r.person.id + "-" + person.id);
                        labels.appendChild(text);
                        // Don't really have a good idea to display multiple spouses,
                        // at the moment it looks like each spouse marries the next one.
                        text.person0 = lastspouse;
                        text.person1 = r.person;
                        lastspouse = r.person;
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
        this.refocusStart = Date.now();          // Begin our animation
        this.refocusEnd = Date.now() + 1000;
        this.focus = focus;
        this.scale.cx0 = this.scale.cx;
        this.scale.cy0 = this.scale.cy;
        if (this.scale.cx0 == null) {
            console.log(this.scale);
            throw new Error();
        }
        this.scale.callback = callback;
        window.requestAnimationFrame(() => { this.draw(); });
    }

    /**
     * Sort people into priority order based on focus.
     * Also assigns them to a generation.
     */
    order(focus, people) {
        let q = [];
        q.push(focus);
        // Of course possibly for nephews to marry aunts, etc.
        // which is why generation needs a start point.
        focus.generation = 0;
        let mingen = 0;
        // Nodes are hidden if they have no name
        // Everything is hidden unless reachable from a non-hidden node
        for (const person of people) {
            person.hidden = true;
        }
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
     * Position all the nodes.
     */
    position(focus, ordered) {
        const style = getComputedStyle(this.svg);
        const MINWIDTH = evalLength(style, style.getPropertyValue("--min-person-width"));
        const SPOUSEMARGIN = evalLength(style, style.getPropertyValue("--spouse-margin"));
        const SIBLINGMARGIN = evalLength(style, style.getPropertyValue("--sibling-margin"));
        const OTHERMARGIN = evalLength(style, style.getPropertyValue("--other-margin"));
        const GENERATIONMARGIN = evalLength(style, style.getPropertyValue("--generation-margin"));

        const genpeople = [];
        const genwidth = [];
        const forces = [];
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
            person.layout = { shift: 0, spouses: [] };
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
            let rect = person.svg.querySelector("rect");
            rect.setAttribute("width", person.genwidth);
            for (let text of person.svg.querySelectorAll("text")) {
                text.setAttribute("x", Math.round(person.genwidth / 2));
            }
            person.svg.classList.toggle("focus", person == focus);
            person.svg.classList.toggle("pending", !person.isLoaded());
            person.svg.classList.remove("spouse");
            for (const par of person.parents()) {
                if (!par.hidden) {
                    forces.push({name: "child", a: par, b: person});
                }
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
                        spouse.svg.classList.add("spouse");
                        spouse.tx += 10;
                        mylast = spouse;
                        person.layout.spouses.push(spouse);
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
                    y = OTHERMARGIN;
                    if (rel == "spouse" || rel == "spouse-spouse") {
                        y = SPOUSEMARGIN;
                        rel = "spouse";
                    } else if (rel == "sibling" || rel == "step-sibling" || rel == "sibling-in-law") {
                        y = SIBLINGMARGIN;
                        rel = "sibling";
                    } else {
                        rel = null;
                    }
                    y += (prev.height + person.height) / 2;
                    person.layout.prev = prev;
                    prev.layout.next = person;
                    person.layout.prevMargin = prev.layout.nextMargin = y;
                    person.layout.prevRel = prev.layout.nextRel = rel;
                    y += prev.ty;
                }
                if (firstchild) { // Y value also derived from mid-point of children
                    let midy = (firstchild.ty + lastchild.ty - spouseheight) / 2;
                    y = isNaN(y) ? midy : Math.max(y, midy);
                }
                if (isNaN(y)) { // No previous element, no children
                    y = person.height / 2;
                }
                person.ty = y;
                if (isNaN(person.ty)) { console.log(person); throw new Error("NAN"); }
                // Node is positioned, now position spouses relative to this node.
                prev = person;
                for (const spouse of person.layout.spouses) {
                    const distance = (prev.height + spouse.height) / 2 + SPOUSEMARGIN;
                    spouse.layout.prev = prev;
                    prev.layout.next = spouse;
                    spouse.layout.prevMargin = prev.layout.nextMargin = distance;
                    spouse.layout.prevRel = prev.layout.nextRel = "spouse";
                    y += distance;
                    spouse.ty = y;
                    if (isNaN(spouse.ty)) { console.log(spouse); throw new Error("NAN"); }
                    prev = spouse;
                }
            } else {
                // This node has been positioned, but traverse children anyway as
                // this node might have been positioned as another's spouse, and
                // have different children to the spouse.
                for (const child of person.children()) {
                    func(person, child);
                }
            }
            return mylast;  // return here to position nodes WRT to all children, including those owned by other nodes
        };
        // Traverse each tree from each root
        for (let subroot of roots) {
            for (let root of subroot) {
                func(null, root);
            }
        }
        for (const person of ordered) {
            if (!person.hidden && isNaN(person.ty)) { console.log(person); throw new Error("NAN"); }
        }

        // STEP 5
        // Layout is valid but we can improve it by doing a force layout between parents
        // and children to pull things to the center.
        let pass;
        const numpasses = 5000;       // Seems generally enough.
        for (let pass=0;pass<numpasses;pass++) {
            for (const f of forces) {
                // Compute vertical distance between parent/child and derive force
                // between them from that. sqrt works, main thing is that double the
                // distance must be more than double the force, otherwise we have
                // a case where two children with distance (40, 0) is as good as (-20, 20)
                // Once force computed, adjust both ends of the spring towards the center.
                let distance = Math.abs(f.a.ty + f.a.layout.shift - f.b.ty - f.b.layout.shift);
                let fval = Math.sqrt(distance);
                if (f.a.ty + f.a.layout.shift > f.b.ty + f.b.layout.shift) {
                    f.a.layout.shift -= fval / 2;
                    f.b.layout.shift += fval / 2;
                } else {
                    f.a.layout.shift += fval / 2;
                    f.b.layout.shift -= fval / 2;
                }
            }
            for (const person of ordered) {
                person.ty += person.layout.shift;
                person.layout.shift = 0;
            }

            // Now we have to correct any overlapping nodes. Traverse each node,
            // any that overlap move both apart and repeat process for both those nodes.
            // There were MANY variations of this tried, this method was the one that worked!
            for (const person of ordered) {
               q.push(person);
            }
            let person, count = 0;
            while ((person = q.shift()) && count++ < 10 * ordered.length) {
                if (person.layout.prev) {
                    let diff = 0;
                    let distance = person.ty - person.layout.prev.ty;
                    if (distance < person.layout.prevMargin) {
                        diff = person.layout.prevMargin - distance; // All nodes have a minimum clearance
                    } else if (distance > person.layout.prevMargin && person.layout.prevRel == "spouse") {
                        diff = person.layout.prevMargin - distance; // Spouses also have a maximum clearance (ie clearance is fixed)
                    }
                    if (diff) {
                        person.layout.prev.ty -= diff / 2;
                        person.ty += diff / 2;
                        q.push(person);
                        q.push(person.layout.prev);
                    }
                }
            }
        }
        // The "last resort" push apart. Seems needed, but only by small amounts.
        for (const person of ordered) {
            if (person.layout.prev) {
                let diff = 0;
                let distance = person.ty - person.layout.prev.ty;
                if (distance < person.layout.prevMargin) {
                    diff = person.layout.prevMargin - distance; // All nodes have a minimum clearance
                } else if (distance > person.layout.prevMargin && person.layout.prevRel == "spouse") {
                    diff = person.layout.prevMargin - distance; // Spouses also have a maximum clearance
                }
                for (let n=person.layout.prev;n && diff;n=n.layout.prev) {
                    n.ty -= diff / 2;
                }
                for (let n=person;n && diff;n=n.layout.next) {
                    n.ty += diff / 2;
                }
            }
        }
    }

    /**
     * Redraw. This is the animation frame
     */
    draw() {
        const edges = this.svg.querySelector(".relations");
        const labels = this.svg.querySelector(".labels");

        // T from 0..1 depending on how far through animation we are
        let t = (Date.now() - this.refocusStart) / (this.refocusEnd - this.refocusStart);
        if (t < 0) {
            return;
        } else if (t >= 1) {
            t = 1;
        } else {
            window.requestAnimationFrame(() => { this.draw() });
        }
        t = t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;  // Simple cubic bezier smoothing

        let x0 = null, x1, y0, y1;
        for (const person of this.people) {
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
            if (path.classList.contains("marriage")) {
                px0 = Math.round(p0.cx) + p0.genwidth * -0.5 + 2;
                py0 = Math.round(p0.cy) + p0.height   * 0.5;
                px3 = Math.round(p1.cx) + p1.genwidth * -0.5;
                py3 = Math.round(p1.cy) + p1.height   * 0;
                px1 = px0;
                py1 = py3;
                px2 = px0;
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
            let d;
            if (false) {
                /*
                // Compute outline of bezier. Tried outlineing strokes, but a lot
                // slower and just varying stroke width gave better results.
                // Uses the "bezier.js" from https://pomax.github.io/bezierjs/
                const bezier = new Bezier(px0, py0, px01, py0, px10, py1, px1, py1);
                let d0 = "", d1 = "";
                let s = bezier.outlineshapes(3);
                let first = true;
                for (let i=0;i<s.length;i++) {
                    let points = s[i].forward.points;
                    for (let j=0;j<points.length;j++) {
                        if (j == 0 && i == 0) {
                            d0 += "M ";
                        } else if (j == 0) {
                            continue;
                        } else if (j == 1) {
                            d0 += points.length == 3 ? "Q " : "C ";
                        }
                        d0 += Math.round(points[j].x) + " " + Math.round(points[j].y) + " ";
                        first = false;
                    }
                    points = s[s.length - i - 1].back.points;
                    for (let j=0;j<points.length;j++) {
                        if (j == 0 && i == 0) {
                            d1 += "L ";
                        } else if (j == 0) {
                            continue;
                        } else if (j == 1) {
                            d1 += points.length == 3 ? "Q " : "C ";
                        }
                        d1  += Math.round(points[j].x) + " " + Math.round(points[j].y) + " ";
                    }
                }
                d = d0 + d1;
                */
            } else {
                d = "M " + px0 + " " + py0 + " C " + px1 + " " + py1 + " " + px2 + " " + py2 + " " + px3 + " " + py3;
            }
            path.setAttribute("d", d);
        }
        for (let label=labels.firstElementChild;label;label=label.nextElementSibling) {
            const p0 = label.person0;
            const p1 = label.person1;
            let cx = Math.round(p0.cx + p1.cx) / 2;
            let cy = Math.round(p0.cy + p1.cy) / 2;
            label.setAttribute("x", cx);
            label.setAttribute("y", cy);
        }
        /* Hack! None of these values apply in SVG, but it lets us style with CSS */
        const style = getComputedStyle(this.svg);
        const padding = Math.round(evalLength(style, style.getPropertyValue("--outer-margin")) / this.scale.scale);
        x0 -= padding;
        y0 -= padding;
        x1 += padding;
        y1 += padding;
        let cx, cy;
        if (this.people.length) {
            cx = this.scale.cx0 + (this.focus.tx - this.scale.cx0) * t;
            cy = this.scale.cy0 + (this.focus.ty - this.scale.cy0) * t;
        }
        this.rescale({x0:x0, y0:y0, x1:x1, y1:y1, cx:cx, cy:cy});
        if (t == 1 && this.scale.callback) {
            this.scale.callback();
        }

    }

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

}

/**
 * The Person object. Lots of duplicated fields (and junk) in here, could certainly be trimmed
 */
class Person {
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

    isHidden() {
        return !this.data.Name || this.pruned;
    }

    isLoaded() {
        return this.data.Name;
    }

    /**
     * Return true if the parents, all the children, all the siblings and all the spouses are loaded.
     */
    isFullyLoaded() {
        // It's possible for a node to be loaded without all its children, so we have to set a flag manually
        if (!this.childrenLoaded) {
            return false;
        }
        for (let r of this.relations) {
            if (!r.person.isLoaded()) {
                return false;
            }
        }
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
        let birthDate = tree.formatDate(this.data.BirthDate, this.data.DataStatus ? this.data.DataStatus.BirthDate : null);
        let deathDate = tree.formatDate(this.data.DeathDate, this.data.DataStatus ? this.data.DataStatus.DeathDate : null);
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
//        log("Link " + this + (rel == "parent" ? " parent " : rel == "child" ? " child " : " spouse ") + person);
        let add = true, changed = false;
        for (let i=0;i<this.relations.length;i++) {
            const r = this.relations[i];
            if (r.person == person && r.rel == rel) {
                if (date && (r.date != date || r.type != type) && (!r.date || type != "inferred" || date < r.date)) {
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
                    person.link("sibling", this);
                }
            } else if (rel == "spouse") {
                person.link("spouse", this, type, date);
            }
        }
    }

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

    action(name) {
        console.log("Action " + name + " on " + this);
        if (name == "nuclear") {
            this.tree.load({keys: this.id, nuclear:1}, () => { this.tree.refocus(this); });
        } else if (name == "ancestors") {
            this.tree.load({keys: this.id, ancestors:4}, () => { this.tree.refocus(this); });
        } else if (name == "descendants") {
            // Load descendents...
            this.tree.load({keys: this.id, descendants:4}, () => {
                // focus...
                this.tree.refocus(this, () => {
                    // then load their unloaded spouses...
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
                        // then focus again
                        this.tree.refocus(this);
                    });
                });
            });
        } else if (name == "profile") {
            window.location = "https://www.wikitree.com/wiki/" + this.data.Name;
        } else if (name == "prune") {
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

window.addEventListener("DOMContentLoaded", initialize);

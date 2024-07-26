"use strict";

const APIURL = "https://api.wikitree.com/api.php";
const APPID = "MikesSlippyTree";
const DEMOID = "Windsor-1";
const SVG = "http://www.w3.org/2000/svg";
const SPOUSE = 0, CHILD = 1, PARENT = 2, SIBLING = 3;

/**
 * This is the entry point
 */
function initialize(svg) {
    const slippy = new SlippyTree({element: document.getElementById("scrollpane") });

    login();

    const idField = document.getElementById("idField");
    const loadButton = document.getElementById("loadButton");
    const scaleSlider = document.getElementById("scaleSlider");
    const loginButton = document.getElementById("loginButton");
    const logoutButton = document.getElementById("logoutButton");
    const expandButton = document.getElementById("expandButton");
    const helpButton = document.getElementById("helpButton");
    const helpContainer = document.getElementById("helpContainer");
    scaleSlider.value = 100;

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
        slippy.load([key], true); 
    });
    helpButton.addEventListener("click", (e) => {
        helpContainer.classList.remove("hidden");
    });
    helpContainer.addEventListener("click", (e) => {
        helpContainer.classList.add("hidden");
    });
    loginButton.addEventListener("click", (e) => { login(true); });
    logoutButton.addEventListener("click", (e) => { login(false); });
    expandButton.addEventListener("click", (e) => { slippy.doExpand(); });
    scaleSlider.addEventListener("input", (e) => {
        helpContainer.classList.add("hidden");
        slippy.rescale({scale:e.target.value / 100});
    });
    window.addEventListener("resize", (e) => { slippy.rescale({}); });

    let key = new URLSearchParams(window.location.search).get("key");
    if (key) {
        id.value = key.trim();
        if (id.value.length) {
            load([id.value], true);
        }
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
        const that = this;
        this.scrollPane = typeof props.element == "string" ? document.querySelector(props.element) : props.element;
        while (this.scrollPane.firstChild) {
            this.scrollPane.firstChild.remove();
        }
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

        document.getElementById("expandButton").disabled = false;
        document.getElementById("scaleSlider").disabled = false;

        this.people = [];
        this.byid = {};
        this.scale = {scale: 1, cx:0, cy: 0};
        this.focus = null;
        this.refocusStart = null;
        this.refocusEnd = null;
        this.loadcallback = props.loaded;

        this.scrollPane.addEventListener("scroll", () => {
            this.scale.cx = (this.scrollPane.clientWidth / 2 + this.scrollPane.scrollLeft) / this.scale.scale;
            this.scale.cy = (this.scrollPane.clientHeight / 2 + this.scrollPane.scrollTop) / this.scale.scale;
        });
    }

    /**
     * Scale or SVG has been adjusted, resize
     * @param props a map to merge over the current scale map
     */
    rescale(m) {
        let o = this.scale;
        for (let key in m) {
            o[key] = m[key];
        }
        const container = this.svg.querySelector(".container");
        const scrollpane = this.scrollPane;
        const svg = this.svg;
        let x0 = container.x0;
        let y0 = container.y0;
        let x1 = container.x1;
        let y1 = container.y1;
        container.setAttribute("transform", "scale(" + o.scale + " " + o.scale + ") translate(" + (-o.x0) + " " + (-o.y0) + ")");
        svg.setAttribute("width", (o.x1 - o.x0) * o.scale);
        svg.setAttribute("height", (o.y1 - o.y0) * o.scale);
        let x = Math.round(scrollpane.scrollLeft = (o.cx * o.scale) - (scrollpane.clientWidth / 2));
        let y = Math.round(scrollpane.scrollTop = (o.cy * o.scale) - (scrollpane.clientHeight / 2));
        if (svg.clientWidth <= scrollpane.clientWidth) {
            svg.style.left = Math.round((scrollpane.clientWidth - svg.clientWidth) / 2) + "px";
            scrollpane.scrollLeft = 0;
        } else {
            svg.style.left = "0";
            scrollpane.scrollLeft = x;
        }
        if (svg.clientHeight <= scrollpane.clientHeight) {
            svg.style.top = Math.round((scrollpane.clientHeight - svg.clientHeight) / 2) + "px";
            scrollpane.scrollTop = 0;
        } else {
            svg.style.top = "0";
            scrollpane.scrollTop = y;
        }
        scrollpane.scrollTop = y;
//        console.log("RESCALE: scale="+JSON.stringify(o)+" sp=["+x+" "+y+" "+scrollpane.scrollWidth+" "+scrollpane.scrollHeight + "]");
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
        for (let n=container.firstchild;n;n=n.nextSibling) {
            while (n.firstChild) {
                n.firstChild.remove();
            }
        }
    }

    /**
     * Called when new nodes added to the tree
     * @param focus an optional person to position the nodes on
     */
    rebuild(focus) {
        // Ensure every person has an SVG, calculate width/height
        for (const person of this.people) {
            if (!person.svg) {
                let rect, path;
                person.svg = document.createElementNS(SVG, "g");
                person.svg.person = person;
                person.svg.addEventListener("click", () => {
                    this.refocus(person);
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
                    text.appendChild(a = document.createElementNS(SVG, "a"));
                    a.appendChild(document.createTextNode(person.presentationName()));
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
                if (focus && !person.x) {
                    person.x = focus.x;
                    person.y = focus.y;
                }
            }
        }
    }

    /**
     * Called when focal node has changed
     */
    refocus(focus) {
        if (!focus.loaded) { // Not loaded! Load then try again
            this.load([focus.data.Name], false, focus);
            return;
        }
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
                if (r.rel == PARENT) {
                    path = document.createElementNS(SVG, "path");
                    path.setAttribute("id", "edge-" + r.person.id + "-" + person.id);
                    if (r.person.data.Gender == "Male") {
                        path.classList.add("father");
                    } else if (r.person.data.Gender == "Female") {
                        path.classList.add("mother");
                    }
                } else if (r.rel == SPOUSE && person.layout.spouses && person.layout.spouses.includes(r.person)) {
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
            if (person.layout.spouses) {
                let lastspouse = person;
                for (const spouse of person.layout.spouses) {
                    let r;
                    for (const r2 of person.relations) {
                        if (r2.rel == SPOUSE && r2.person == spouse) {
                            r = r2;
                            break;
                        }
                    }
                    if (r.rel == SPOUSE && r.type != "inferred" && r.date) {
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
        console.log("focussing on " + this.focus);
        window.requestAnimationFrame(() => { this.draw(); });
    }

    /**
     * Sort people into priority order based on focus.
     * Also assigns them to a generation.
     */
    order(focus, people) {
        let q = [];
        for (const person of people) {
            person.generation;
        }
        q.push(focus);
        // Of course possibly for nephews to marry aunts, etc.
        // which is why generation needs a start point.
        focus.generation = 0;
        let mingen = 0;
        for (let i=0;i<q.length;i++) {
            const person = q[i];
            person.priority = i;
            mingen = Math.min(mingen, person.generation);
            for (let spouse of person.spouses()) {
                if (!q.includes(spouse)) {
                    spouse.generation = person.generation;
                    q.push(spouse);
                }
            }
            for (let child of person.children()) {
                if (!q.includes(child)) {
                    child.generation = person.generation + 1;
                    q.push(child);
                    for (let spouse of child.spouses()) {
                        if (!q.includes(spouse)) {
                            spouse.generation = person.generation + 1;
                            q.push(spouse);
                        }
                    }
                }
            }
            for (let par of person.parents()) {
                if (!q.includes(par)) {
                    par.generation = person.generation - 1;
                    q.push(par);
                    for (let spouse of par.spouses()) {
                        if (!q.includes(spouse)) {
                            spouse.generation = person.generation - 1;
                            q.push(spouse);
                        }
                    }
                }
            }
        }
        for (const person of people) {
            if (!q.includes(person)) {
                throw new Error("missing " + person);
            }
        }
        for (let person of people) {
            person.generation -= mingen;
        }
        return q;
    }

    /**
     * Position all the nodes.
     */
    position(focus, ordered) {
        const style = getComputedStyle(this.svg);
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
                genwidth[generation] = 0;
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
                        if (n.mother) {
                            q.push(n.mother);
                        } else if (!n.father) {
                            subroots.push(n);
                        }
                        n = n.father;
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
            person.svg.classList.toggle("pending", !person.loaded);
            person.svg.classList.remove("spouse");
            if (person == focus) {
                person.svg.querySelector("a").setAttribute("href", "https://www.wikitree.com/wiki/" + person.data.Name);
            } else {
                person.svg.querySelector("a").removeAttribute("href");
            }
            for (const par of person.parents()) {
                forces.push({name: "child", a: par, b: person});
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
                    if (spouse.generation == generation && !genpeople[generation].includes(spouse)) {
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
            if (isNaN(person.ty)) { console.log(person); throw new Error("NAN"); }
        }

        // STEP 5
        // Layout is valid but we can improve it by doing a force layout between parents
        // and children to pull things to the center.
        let pass;
        const numpasses = 50;       // Seems generally enough.
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
        const pt = evalLength(style, style.paddingTop);
        const pr = evalLength(style, style.paddingRight);
        const pb = evalLength(style, style.paddingBottom);
        const pl = evalLength(style, style.paddingLeft);
        x0 -= pl;
        y0 -= pt;
        x1 += pr;
        y1 += pb;
        let cx = this.scale.cx0 + (this.focus.tx - this.scale.cx0) * t;
        let cy = this.scale.cy0 + (this.focus.ty - this.scale.cy0) * t;
        this.rescale({x0:x0, y0:y0, x1:x1, y1:y1, cx:cx, cy:cy});
    }

    formatDate(date, state) {
        if (date.endsWith("-00-00")) {
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


    getOrCreatePerson(id, data) {
        let person = this.byid[id]; 
        let created = false;
        if (!person) {
            person = new Person(this.people.length, id);
            this.byid[id] = person;
            if (data && data.Name) {
                this.byid[data.Name] = person;
            }
            this.people.push(person);
            created = true;
        }
        let fields = ["Name", "FirstName", "MiddleName", "LastNameAtBirth", "LastNameCurrent", "Suffix", "Gender", "BirthDate", "DeathDate", "Father", "Mother", "IsMember", "IsLiving", "Privacy" ];
        if (data) {
            for (let f of fields) {
                if (data[f]) {
                    person.data[f] = data[f];
                }
            }
            if (data.BirthDate && data.BirthDate != "0000-00-00") {
                person.BirthDate = this.formatDate(data.BirthDate, data.DataStatus ? data.DataStatus.BirthDate : null);
            }
            if (data.DeathDate && data.DeathDate != "0000-00-00") {
                person.DeathDate = this.formatDate(data.DeathDate, data.DataStatus ? data.DataStatus.DeathDate : null);
            }
        }
        if (created) {
            person.link(SIBLING, person, null, null);
        }
        return person;
    }

    /**
     * Find up to N unloaded people starting from focal point, and load them
     */
    doExpand() {
        if (this.people.length) {
            let focus = this.focus ? this.focus : this.people[0];
            let l = this.order(focus, this.people);
            let ids = [];
            for (let person of l) {
                if (!person.loaded && person.data.Name) {
                    ids.push(person.data.Name);
                    if (ids.length == 50) {
                        break;
                    }
                }
            }
            if (ids.length) {
                this.load(ids, false, focus);
            }
        }
    }

    /**
     * Load people.
     * Sadly Wikitree API won't let us exclude people we already know about, so some of this
     * will be duplicated
     * @param ids array of IDs to load
     * @param resetFirst if true, do a reset if our load is successful
     * @param focus which node to focus on when load completes, or first new node loaded if not set
     */
    load(ids, resetFirst, focus) {
        console.log("Load " + ids.join());
        const url = APIURL + "?appId=" + APPID + "&action=getRelatives&keys=" + ids.join(",") + "&fields=Id,Name,FirstName,MiddleName,LastNameAtBirth,LastNameCurrent,Suffix,BirthDate,DeathDate,Gender,DataStatus,IsLiving,IsMember,Privacy&getParents=true&getChildren=true&getSpouses=true&getDescendants=true";
    //    const url = "test2.json";
        fetch(url, {
            credentials: "include"
        })
          .then(x => x.json())
          .then(data => {
              if (data[0].items) {
                  if (resetFirst) {
                      this.reset();
                  }
                  data = data[0].items;
                  let len = this.people.length;
                  for (let i=0;i<data.length;i++) {
                      const r = data[i].person;
                      let person = this.getOrCreatePerson(r.Id, r);
                      person.origdata = data;
                      person.loaded = true;
                      person.relations = [];
                      person.link(SIBLING, person, null, null);
                      if (r.Parents) {
                          for (let id in r.Parents) {
                              let certainty = id == r.Father ? r.DataStatus.Father : id == r.Mother ? r.DataStatus.Mother : "";
                              switch (certainty) {
                                  case "30": certainty = "dna"; break;
                                  case "20": certainty = "confident"; break;
                                  case "10": certainty = "uncertain"; break;
                                  case "5": certainty = "nonbiological"; break;
                                  default: certainty = null;
                              }
                              const par = this.getOrCreatePerson(id, r.Parents[id]);
                              person.link(PARENT, par, null, certainty);
                              for (const sibling of par.children()) {
                                  person.link(SIBLING, sibling, null, null);
                              }
                          }
                          if (r.Father && r.Mother) {
                              this.getOrCreatePerson(r.Father).link(SPOUSE, this.getOrCreatePerson(r.Mother), r.BirthDate, "inferred");    // Presumed spouses, reset on load
                          }
                      }
                      if (r.Spouses) {
                          for (let id in r.Spouses) {
                              let date = r.Spouses[id].marriage_date;
                              if (date == "0000" || date == "0000-00-00") {
                                  date = null;
                              }
                              person.link(SPOUSE, this.getOrCreatePerson(id, r.Spouses[id]), date, r.Spouses[id].data_status.marriage_date);
                          }
                      }
                      if (r.Children) {
                          for (let id in r.Children) {
                              person.link(CHILD, this.getOrCreatePerson(id, r.Children[id]), r.Children[id].BirthDate, "inferred");
                          }
                          for (let c1 of person.children()) {
                              for (let c2 of person.children()) {
                                  c1.link(SIBLING, c2, null);
                              }
                          }
                      }
                  }
                  if (len != this.people.length) {
                      this.rebuild(focus);            // People were added
                  }
                  if (!focus) {
                      focus = this.byid[ids[0]]; // Focus on first person loaded
                  }
                  this.refocus(focus); // Focus on first person loaded
              }
          });
    }
}

    /**
     * The Person object. Lots of duplicated fields (and junk) in here, could certainly be trimmed
     */
function Person(index, id) {
    this.index = index;  // local index into array
    this.id = id;        // unique number from wikitree
    this.data = {};
    const that = this;
    this.relations = [];

    this.toString = function() {
        let out = "\"";
        out += this.id;
        if (this.data.Name) {
            out += " " + this.data.Name;
        }
        out += " " +this.presentationName()+" "+this.presentationExtra();
        out += "\"";
        return out;
    };

    this.presentationName = function() {
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

    this.presentationExtra = function() {
        let out = "";
        if (this.BirthDate && this.DeathDate) {
            out += " (" + this.BirthDate + " - " + this.DeathDate + ")";
        } else if (this.BirthDate) {
            out += " (" + this.BirthDate + ")";
        } else if (this.DeathDate) {
            out += " (-" + this.DeathDate + ")";
        }
        return out;
    }

    this.link = function(rel, person, date, type) {
        if (!person) {
            throw Error("person is null");
        }
        if (rel == SIBLING || rel == CHILD) {
            date = person.data.BirthDate;
        } else if (rel == PARENT) {
            date = this.data.BirthDate;
            if (person.id == this.data.Father) {
                this.father = person;
            } else if (person.id == this.data.Mother) {
                this.mother = person;
            }
        }
//        log("Link " + this + (rel == PARENT ? " parent " : rel == CHILD ? " child " : " spouse ") + person);
        let add = true, changed = false;
        for (let i=0;i<this.relations.length;i++) {
            const r = this.relations[i];
            if (r.person == person && r.rel == rel) {
                if (date && (r.date != date || r.type != type)) {
                    if (!r.date || type != "inferred" || date < r.date) {
                        r.date = date;
                        r.type = type;
                        changed = true;
                    }
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
                    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index;
                } else if (a.date) {
                    return -1;
                } else if (b.date) {
                    return 1;
                } else {
                    return a.index - b.index;
                }
            });
            person.link(rel == PARENT ? CHILD : rel == CHILD ? PARENT : rel, this, date, type);
        }
//        log("Link " + this + (rel == PARENT ? " parent " : rel == CHILD ? " child " : " spouse ") + person+" done: sibings = " + Array.from(this.siblings()));
    }

    this.children = function*() {
        for (const r of this.relations) {
            if (r.rel == CHILD) {
                yield r.person;
            }
        }
    };

    this.parents = function*() {
        for (const r of this.relations) {
            if (r.rel == PARENT) {
                yield r.person;
            }
        }
    };

    this.spouses = function*() {
        for (const r of this.relations) {
            if (r.rel == SPOUSE) {
                yield r.person;
            }
        }
    };

    // Includes self!
    this.siblings = function*() {
        for (const r of this.relations) {
            if (r.rel == SIBLING) {
                yield r.person;
            }
        }
    };


    /**
     * Return one of "parent", "child", "spouse", "child-inlaw", "spouse-inlaw", "parent-in-law", "step-child", "step-parent", "spouse-spouse" (ie spouse's other spouse), "sibling-in-law", "uncle/aunt', "nephew/niece"
     */
    this.relationshipName = function(other) {
        let out = null;
        if (other) {
            for (let r of this.relations) {
                if (r.person == other) {
                    out = r.rel == CHILD ? "child" : r.rel == PARENT ? "parent" : r.rel == SPOUSE ? "spouse" : "sibling";
                }
                if (out) break;
            }
            if (!out) {
                for (let r of this.relations) {
                    for (let r2 of r.person.relations) {
                        if (r2.person == other) {
                            if (r.rel == SPOUSE) {  // relative of my spouse
                                out = r2.rel == CHILD ? "step-child" : r2.rel == PARENT ? "parent-in-law" : r2.rel == SIBLING ? "sibling-in-law" : "spouse-spouse";
                            } else if (r.rel == PARENT) {  // relative of my parent
                                out = r2.rel == CHILD ? "sibling" : r2.rel == PARENT ? "grand-parent" : r2.rel == SIBLING ? "uncle/aunt" : "parent-in-law";
                            } else if (r.rel == CHILD) {  // relative of my child
                                out = r2.rel == CHILD ? "grand-child" : r2.rel == PARENT ? "spouse" : r2.rel == SIBLING ? "step-child" : "child-in-law";
                            } else if (r.rel == SIBLING) {  // relative of my sibling
                                out = r2.rel == CHILD ? "nephew/niece" : r2.rel == PARENT ? "step-parent" : r2.rel == SIBLING ? "sibling" : "sibling-in-law";
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

}

window.addEventListener("DOMContentLoaded", initialize);

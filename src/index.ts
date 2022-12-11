// Events have two pieces: a name for the event they listen for
// and a way to turn the event object into a message that can be processed
// with our update functions.
type Event<message> = {
    name: string;
    messageConverter(data: globalThis.Event): message;
};

// Provide users with a function to create events.
function on<message>(
    eventName: string,
    listener: (data: any) => message
): Event<message> {
    return {
        name: eventName,
        messageConverter: listener,
    };
}

type StringAttribute = {
    kind: "StringAttribute";
    key: string;
    value: string;
};

type BooleanAttribute = {
    kind: "BooleanAttribute";
    key: string;
    value: boolean;
};

// Attributes take many forms - some don't need any value, some need boolean values.
// For now we'll just focus on string attributes e.g class or value.
type Attribute = StringAttribute | BooleanAttribute;

function attribute(key: string, value: string | boolean): Attribute {
    if (typeof value === "string") {
        return {
            kind: "StringAttribute",
            key,
            value,
        };
    } else {
        return {
            kind: "BooleanAttribute",
            key,
            value,
        };
    }
}

// Valid tags.
type Tag = "div" | "h1" | "button" | "input";

// To provide a way to do patching and generation of html,
// we build up an abstract syntax tree (AST).
// Working with an AST allows you to provide a higher level API
// for users of your library, while also restricting what's possible.
// The first half of the AST are Nodes - these map directly to HTML tags.
// For now, we'll allow them all to have children. Think of a div inside a div.
// Nodes have events, which are of generic type message. _eventListeners is used
// to keep track of attached listeners, so they can be removed during patching.
// Nodes also have attributes.
type Node<message> = {
    kind: "Node";
    tag: Tag;
    children: Html<message>[];
    events: Event<message>[];
    _eventListeners: {
        event: Event<message>;
        listener: EventListener;
    }[];
    attributes: Attribute[];
};

// The second half of the AST are TextNodes - the string content inside a HTML tag
// For example <div>Hello world</div> would be Node("div", [ TextNode("Hello world") ], [ ])
type TextNode = { kind: "Text"; content: string };

type Html<message> = Node<message> | TextNode;

// To provide users of the library with better auto complete and restrict the inside baseball
// of how the AST looks, we provide these helper functions.
function node<message>(
    tag: Tag,
    children: Html<message>[],
    events: Event<message>[],
    attributes: Attribute[]
): Html<message> {
    return {
        kind: "Node",
        tag,
        children,
        events,
        _eventListeners: [ ],
        attributes,
    };
}

function div<message>(
    children: Html<message>[],
    events: Event<message>[],
    attributes: Attribute[]
): Html<message> {
    return node("div", children, events, attributes);
}

function h1<message>(
    children: Html<message>[],
    events: Event<message>[],
    attributes: Attribute[]
): Html<message> {
    return node("h1", children, events, attributes);
}

function button<message>(
    children: Html<message>[],
    events: Event<message>[],
    attributes: Attribute[]
): Html<message> {
    return node("button", children, events, attributes);
}

function input<message>(
    children: Html<message>[],
    events: Event<message>[],
    attributes: Attribute[]
): Html<message> {
    return node("input", children, events, attributes);
}

function text(content: string): Html<any> {
    return {
        kind: "Text",
        content,
    };
}

// The basics of the Elm architecture.
// Every running program is based on a model, which is the data store
// and the message, which is how interactions or events are sent to the program.
// Every Elm architecture framework roughly follows this structure.
// An initial model is passed, to generate the initial view.
// An update function describes how to take a message and a model, and return the next model.
// Finally, the view function will take a model and produce something that be rendered
type Program<model, message> = {
    initialModel: model;
    update(message: message, model: model): model;
    view(model: model): Html<message>;
};

// Once we've started a program, we'll want a type to represent it.
// For now, we'll just define an empty object.
type RunningProgram = {};

type Tree = HTMLElement | Text;

// there are two ways of setting values on html elements: properties and attributes.
// Properties you'd set like element["value"] = ""
// Whereas attributes are set via element.setAttribute
function isProperty(tag: string, key: string): boolean {
    switch (tag) {
        case "INPUT":
            return (
                key === "checked" ||
                key === "indeterminate" ||
                key === "value" ||
                key === "readonly" ||
                key === "disabled"
            );
        case "OPTION":
            return key === "selected" || key === "disabled";
        case "TEXTAREA":
            return key === "value" || key === "readonly" || key === "disabled";
        case "SELECT":
            return key === "value" || key === "disabled";
        case "BUTTON":
        case "OPTGROUP":
            return key === "disabled";
    }
    return false;
}

// set an attribute based on whether it's a property or not
function setAttribute(currentTree: HTMLElement, attribute: Attribute) {
    if (isProperty(currentTree.tagName, attribute.key)) {
        (currentTree as any)[attribute.key] = attribute.value;
    } else {
        switch (attribute.kind) {
            case "BooleanAttribute": {
                // boolean attributes can be set to be their own key, if it's there.
                if (attribute.value) {
                    currentTree.setAttribute(attribute.key, attribute.key);
                } else if (
                    currentTree.getAttribute(attribute.key) === attribute.key
                ) {
                    currentTree.removeAttribute(attribute.key);
                }
                return;
            }
            case "StringAttribute": {
                currentTree.setAttribute(attribute.key, attribute.value);
                return;
            }
        }
    }
}

// We need some way of turning our AST into actual things the DOM API can use
// so Nodes are turned into HTMLElements, and TextNodes are turned into Text.
function buildTree<message>(
    listener: (data: any) => message,
    html: Html<message>
): Tree {
    switch (html.kind) {
        case "Node": {
            const node = document.createElement(html.tag);
            for (const event of html.events) {
                const eventListener = (data: globalThis.Event) => {
                    listener(event.messageConverter(data));
                };

                node.addEventListener(event.name, eventListener, {
                    once: true,
                });

                html._eventListeners.push({
                    event: event,
                    listener: eventListener,
                });
            }
            for (const child of html.children) {
                node.appendChild(buildTree(listener, child));
            }
            for (const attribute of html.attributes) {
                setAttribute(node, attribute);
            }
            return node;
        }
        case "Text": {
            return document.createTextNode(html.content);
        }
    }
}

// To keep track of how patching went, we keep track of the
// replaced, patched, removed and added elements.
// This will be helpful when debugging - patching is a recursive function
// that goes quite deep, so knowing what happened is useful.
type PatchStatus = {
    replaced: number;
    patched: number;
    removed: number;
    added: number;
};

// Patching events involves removing listeners from an element
// and then attaching new event listeners.
// A puzzle for the reader to investigate: how might we avoid
// removing / re-adding event listeners that will stick around?
function patchEvents<message>(
    listener: (msg: message) => void,
    previousView: Html<message>,
    nextView: Html<message>,
    currentTree: Tree
) {
    if (previousView.kind !== "Text") {
        for (const event of previousView._eventListeners) {
            currentTree.removeEventListener(event.event.name, event.listener);
        }
    }

    if (nextView.kind !== "Text") {
        for (const event of nextView.events) {
            const eventListener = (data: globalThis.Event) => {
                listener(event.messageConverter(data));
            };

            currentTree.addEventListener(event.name, eventListener, {
                once: true,
            });

            nextView._eventListeners.push({
                event: event,
                listener: eventListener,
            });
        }
    }
}

// Patching attributes has four parts:
// 1) remove any attributes that don't exist any more
// 2) add new attributes that didn't exist previously
// 3) don't change attributes that exist with the same value
// 4) change attributes that have changed in value
// 1 and 2 are pretty simple, but 3 and 4 are important
// If you change values to be exactly what they are already
// it can trigger a redraw
// We will handle 3 later
function patchAttributes<message>(
    previousView: Html<message>,
    nextView: Html<message>,
    currentTree: HTMLElement
) {
    switch (nextView.kind) {
        case "Text": {
            return;
        }
        case "Node": {
            // remove attributes from the previously rendered node
            if (previousView.kind !== "Text") {
                for (const attribute of previousView.attributes) {
                    currentTree.removeAttribute(attribute.key);
                }
            }

            // set attributes
            for (const attribute of nextView.attributes) {
                setAttribute(currentTree, attribute);
            }
        }
    }
}

// Patching a node involves detecting changes in the previous view and the next view
// then modifying the DOM in order to reflect the next view.
// A listener is passed in that will form the core of our update loop.
// You can think of it as a way to send a message to the update loop.
function patch<message>(
    listener: (msg: message) => void,
    previousView: Html<message>,
    nextView: Html<message>,
    currentTree: Tree
): PatchStatus {
    const status: PatchStatus = {
        replaced: 0,
        patched: 0,
        removed: 0,
        added: 0,
    };

    // if we are given two different ASTs, just replace the current tree
    // with the next one.
    if (previousView.kind !== nextView.kind) {
        currentTree.replaceWith(buildTree(listener, nextView));
        return { ...status, replaced: 1 };
    }

    switch (previousView.kind) {
        // if we have a text node, just replace the current child with the next view
        case "Text": {
            currentTree.replaceWith(buildTree(listener, nextView));
            return { ...status, replaced: 1 };
        }
        case "Node": {
            nextView = nextView as Node<message>;
            currentTree = currentTree as HTMLElement;

            // if we have a node with a different tag from the previous view
            // replace the current element with the next view.
            if (previousView.tag !== nextView.tag) {
                currentTree.replaceWith(buildTree(listener, nextView));
                return { ...status, replaced: 1 };
            } else {
                patchEvents(listener, previousView, nextView, currentTree);
                patchAttributes(previousView, nextView, currentTree);

                // patch any existing children.
                // add any missing children.
                for (let i = 0; i < nextView.children.length; i++) {
                    const previousChild = previousView.children[i];
                    const nextChild = nextView.children[i];
                    const currentChild = currentTree.childNodes[i];

                    // if we didn't previously have a node at this point
                    if (typeof currentChild === "undefined") {
                        currentTree.appendChild(buildTree(listener, nextChild));
                        status.added++;
                    } else {
                        // make sure that the current child is something we can patch
                        if (
                            currentChild.ELEMENT_NODE ||
                            currentChild.TEXT_NODE
                        ) {
                            const childPatched = patch(
                                listener,
                                previousChild,
                                nextChild,
                                currentChild as HTMLElement | Text
                            );

                            status.added += childPatched.added;
                            status.patched += childPatched.patched;
                            status.removed += childPatched.removed;
                            status.replaced += childPatched.replaced;
                        }
                    }
                }

                // remove any excess children that were added to the dom during the previous render
                for (
                    let i = currentTree.childNodes.length - 1;
                    i > nextView.children.length - 1;
                    i--
                ) {
                    const node = currentTree.childNodes[i];
                    currentTree.removeChild(node);
                    status.removed++;
                }

                status.patched++;

                return status;
            }
        }
    }
}

// Takes a program, then actually calls the related functions.
// Populates a root tag with the content provided by the view function.
function runProgram<model, message>(
    program: Program<model, message>
): RunningProgram {
    let currentModel = program.initialModel;
    let previousView = program.view(currentModel);
    let currentTree: Tree | null = null;

    const root = document.getElementById("root");
    if (root) {
        const listener = (msg: message) => {
            if (currentTree === null) return;
            currentModel = program.update(msg, currentModel);

            const nextView = program.view(currentModel);
            const status = patch(listener, previousView, nextView, currentTree);
            console.log("Patching status:");
            console.log(JSON.stringify(status));
            previousView = nextView;
        };

        currentTree = buildTree(listener, previousView);
        // we now replace the children of the root element with the elements
        root.replaceChildren(currentTree);
    } else {
        console.error(
            "You forgot to define a <div id='root'></div> inside body"
        );
    }

    return {};
}

// --------------------------------------------------
// Our application.

// Our model.
type Model = {
    currentName: string;
    names: string[];
    checkedNames: string[];
};

type Noop = {
    kind: "Noop";
};

function Noop(): Noop {
    return { kind: "Noop" };
}

type Click = {
    kind: "Click";
};

function Click(): Click {
    return { kind: "Click" };
}

type SetCurrentName = {
    kind: "SetCurrentName";
    value: string;
};

function SetCurrentName(value: string): SetCurrentName {
    return { kind: "SetCurrentName", value };
}

type Remove = {
    kind: "Remove";
    name: string;
};

function Remove(name: string): Remove {
    return { kind: "Remove", name };
}

type Check = {
    kind: "Check";
    name: string;
};

function Check(name: string): Check {
    return { kind: "Check", name };
}

// Our union type of messages.
// We have Noop - aka, do nothing, and Click - aka, a user has clicked the button.
type Message = Noop | Click | SetCurrentName | Remove | Check;

// Initial model
const initialModel: Model = {
    currentName: "",
    names: [ ],
    checkedNames: [ ],
};

// Our update function.
function update(message: Message, model: Model): Model {
    switch (message.kind) {
        case "Noop": {
            return model;
        }
        case "Click": {
            return {
                ...model,
                names: [ ...model.names, model.currentName ],
                checkedNames: [ ...model.names, model.currentName ],
                currentName: "",
            };
        }
        case "SetCurrentName": {
            return { ...model, currentName: message.value };
        }
        case "Remove": {
            return {
                ...model,
                names: model.names.filter((name) => name !== message.name),
            };
        }
        case "Check": {
            if (model.checkedNames.indexOf(message.name) === -1) {
                return {
                    ...model,
                    checkedNames: [ ...model.checkedNames, message.name ],
                };
            } else {
                return {
                    ...model,
                    checkedNames: model.checkedNames.filter(
                        (name) => name !== message.name
                    ),
                };
            }
        }
    }
}

// Our view functions.
function viewTitle(): Html<Message> {
    return h1([ text("Name collector") ], [ ], [ attribute("class", "title") ]);
}

function viewNameEntry(model: Model): Html<Message> {
    return div(
        [
            text(`Enter a name`),
            input(
                [ ],
                [ on("input", (data) => SetCurrentName(data.target.value)) ],
                [ attribute("value", model.currentName) ]
            ),
            button([ text("Add") ], [ on("click", () => Click()) ], [ ]),
        ],
        [ ],
        [ ]
    );
}

function viewName(name: string, isChecked: boolean): Html<Message> {
    return div(
        [
            input(
                [ ],
                [ on("click", () => Check(name)) ],
                [
                    attribute("type", "checkbox"),
                    attribute("checked", isChecked),
                ]
            ),
            text(name),
            button(
                [ text("Remove this name") ],
                [ on("click", () => Remove(name)) ],
                [ ]
            ),
        ],
        [ ],
        [ attribute("class", "name-list-item") ]
    );
}

function viewNames(model: Model): Html<Message> {
    return div(
        [
            ...model.names.map((name) =>
                viewName(name, model.checkedNames.includes(name))
            ),
            div(
                [ text("Checked names: " + model.checkedNames.join(", ")) ],
                [ ],
                [ ]
            ),
        ],
        [ ],
        [ ]
    );
}

function view(model: Model): Html<Message> {
    return div(
        [ viewTitle(), viewNameEntry(model), viewNames(model) ],
        [ ],
        [ ]
    );
}

// Actually run the program.
const program = runProgram({
    initialModel,
    view,
    update,
});

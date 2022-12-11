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

// Valid tags.
type Tag = "div" | "h1" | "button";

// To provide a way to do patching and generation of html,
// we build up an abstract syntax tree (AST).
// Working with an AST allows you to provide a higher level API
// for users of your library, while also restricting what's possible.
// The first half of the AST are Nodes - these map directly to HTML tags.
// For now, we'll allow them all to have children. Think of a div inside a div.
// Nodes have events, which are of generic type message. _eventListeners is used
// to keep track of attached listeners, so they can be removed during patching.
type Node<message> = {
    kind: "Node";
    tag: Tag;
    children: Html<message>[];
    events: Event<message>[];
    _eventListeners: {
        event: Event<message>;
        listener: EventListener;
    }[];
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
    events: Event<message>[]
): Html<message> {
    return {
        kind: "Node",
        tag,
        children,
        events,
        _eventListeners: [ ],
    };
}

function div<message>(
    children: Html<message>[],
    events: Event<message>[]
): Html<message> {
    return node("div", children, events);
}

function h1<message>(
    children: Html<message>[],
    events: Event<message>[]
): Html<message> {
    return node("h1", children, events);
}

function button<message>(
    children: Html<message>[],
    events: Event<message>[]
): Html<message> {
    return node("button", children, events);
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
                    i > nextView.children.length;
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
    name: string;
    clicks: number;
};

// Our union type of messages.
// We have Noop - aka, do nothing, and Click - aka, a user has clicked the button.
type Message = "Noop" | "Click";

// Initial model
const initialModel: Model = {
    name: "Noah",
    clicks: 0,
};

// Our update function.
function update(message: Message, model: Model): Model {
    switch (message) {
        case "Noop": {
            return model;
        }
        case "Click": {
            return { ...model, clicks: model.clicks + 1 };
        }
    }
}

// Our view function.
function view(model: Model): Html<Message> {
    // Conditionally render a click button based on number of clicks.
    // If there are more than 4 clicks, disable the button from clicking.
    const clickButton =
        model.clicks < 5
            ? button([ text("Click me!") ], [ on("click", () => "Click") ])
            : button([ text("You've clicked too much") ], [ ]);

    return div(
        [
            h1([ text("Hi there") ], [ ]),
            div(
                [
                    text(
                        `Welcome ${model.name}. You've clicked ${model.clicks} times`
                    ),
                ],
                [ ]
            ),
            clickButton,
        ],
        [ ]
    );
}

// Actually run the program.
const program = runProgram({
    initialModel,
    view,
    update,
});

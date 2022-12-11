// To provide a way to do patching and generation of html,
// we build up an abstract syntax tree (AST).
// Working with an AST allows you to provide a higher level API
// for users of your library, while also restricting what's possible.
// The first half of the AST are Nodes - these map directly to HTML tags.
// For now, we'll allow them all to have children. Think of a div inside a div.
type Node = {
    kind: "Node";
    tag: "div" | "h1";
    children: Html[];
};

// The second half of the AST are TextNodes - the string content inside a HTML tag
// For example <div>Hello world</div> would be Node("div", [ TextNode("Hello world") ])
type TextNode = { kind: "Text"; content: string };

type Html = Node | TextNode;

// To provide users of the library with better auto complete and restrict the inside baseball
// of how the AST looks, we provide these helper functions.
function div(children: Html[]): Html {
    return {
        kind: "Node",
        tag: "div",
        children,
    };
}

function h1(children: Html[]): Html {
    return {
        kind: "Node",
        tag: "h1",
        children,
    };
}

function text(content: string): Html {
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
// An update function describes how to take a message and a model, and return the next model
// Finally, the view function will take a model and produce something that be rendered
type Program<model, message> = {
    initialModel: model;
    update(message: message, model: model): model;
    view(model: model): Html;
};

// Once we've started a program, we'll want a type to represent it.
// For now, we'll just define an empty object.
type RunningProgram = {};

// We need some way of turning our AST into actual things the DOM API can use
// so Nodes are turned into HTMLElements, and TextNodes are turned into Text.
function buildTree(html: Html): HTMLElement | Text {
    switch (html.kind) {
        case "Node": {
            const node = document.createElement(html.tag);
            for (const child of html.children) {
                node.appendChild(buildTree(child));
            }
            return node;
        }
        case "Text": {
            return document.createTextNode(html.content);
        }
    }
}

// Takes a program, then actually calls the related functions.
// Populates a root tag with the content provided by the view function.
// At this point, we don't have a way for interactions or messages to be triggered
// so we don't actually do anything with update yet.
function runProgram<model, message>(
    program: Program<model, message>
): RunningProgram {
    let currentModel = program.initialModel;
    let view = program.view(currentModel);

    const root = document.getElementById("root");
    if (root) {
        // we now replace the children of the root element with the elements
        root.replaceChildren(buildTree(view));
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
};

// Our union type of messages.
// Currently we only have Noop - aka, do nothing.
type Message = "Noop";

// Initial model
const initialModel: Model = {
    name: "Noah",
};

// Our update function.
function update(message: Message, model: Model): Model {
    switch (message) {
        case "Noop": {
            return model;
        }
    }
}

// Our view function.
function view(model: Model): Html {
    return div([
        h1([ text("Hi there") ]),
        div([ text(`Welcome ${model.name}`) ]),
    ]);
}

// Actually run the program.
const program = runProgram({
    initialModel,
    view,
    update,
});

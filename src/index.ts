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
    view(model: model): string;
};

// Once we've started a program, we'll want a type to represent it.
// For now, we'll just define an empty object.
type RunningProgram = {};

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
        root.innerHTML = view;
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
function view(model: Model): string {
    return `Hi ${model.name}`;
}

// Actually run the program.
const program = runProgram({
    initialModel,
    view,
    update,
});

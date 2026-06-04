const { io } = require("socket.io-client");
const socket = io("http://localhost:3000", { path: '/socket.io/' });
socket.on("connect", () => {
    console.log("Connected");
    socket.emit("player_join", { userId: "test1", displayName: "Test", pictureUrl: "" });
    socket.emit("add_bot");
    socket.emit("add_bot");
    socket.emit("add_bot");
    socket.emit("add_bot");
    setTimeout(() => {
        socket.emit("start_game");
    }, 1000);
});
socket.on("system_message", msg => console.log("System:", msg));
socket.on("receive_cards", cards => console.log("Cards:", cards));
socket.on("game_state", state => {
    let p = state.players.find(p => p.isActive);
    if (p) {
        console.log(`Active player: ${p.displayName} (isBot: ${p.isBot})`);
        if (!p.isBot && p.id === socket.id) {
            console.log("My turn, calling...");
            socket.emit("action", { action: "call" });
        }
    }
});

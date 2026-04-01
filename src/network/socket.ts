import { io, Socket } from 'socket.io-client';

// Dynamically use the same hostname as the page so mobile devices on the LAN can connect
const URL = `http://${window.location.hostname}:3001`;

export const socket: Socket = io(URL, {
    autoConnect: false,
});

export const connectSocket = () => {
    if (!socket.connected) {
        socket.connect();
    }
}

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
}

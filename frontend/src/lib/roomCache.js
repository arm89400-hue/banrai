// Keeps the last /api/rooms answer in memory, so a room page opened from a
// room card can draw straight away instead of showing an empty page while
// it waits for the server. The fresh answer still replaces it a moment later.
let lastList = null;

export function rememberRooms(data) {
  if (data?.rooms) lastList = data;
  return data;
}

export const cachedRooms = () => lastList;

export function cachedRoom(id) {
  const room = lastList?.rooms.find((r) => String(r.id) === String(id));
  return room ? { ...lastList, room } : null;
}

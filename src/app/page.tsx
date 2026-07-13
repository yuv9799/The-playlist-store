import Dashboard from "./Dashboard";
import { getPlaylists } from "./actions";
import { getCurrentUser } from "../lib/auth";

// Force dynamic rendering to load fresh database contents on every request
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  const playlistsResult = await getPlaylists();
  
  const playlists = playlistsResult.success && playlistsResult.playlists 
    ? playlistsResult.playlists 
    : [];

  return (
    <Dashboard 
      initialPlaylists={playlists as any} 
      currentUser={{ id: user.id, email: user.email }} 
    />
  );
}

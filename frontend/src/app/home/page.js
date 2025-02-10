// pages/index.js
import ChatComponent from "../../components/ChatComponent";

export default function Home() {
  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 bg-black font-[Geist-Sans] text-white">
      <header className="w-full text-center">
        <h1 className="text-4xl sm:text-5xl font-bold">Chat Application</h1>
      </header>

      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start w-full max-w-3xl bg-[#1a1a1a] p-6 rounded-lg shadow-lg">
        <div className="w-full">
          <ChatComponent />
        </div>
      </main>

      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center text-sm text-gray-400">
        <p>© 2025 Chat App. All rights reserved.</p>
      </footer>
    </div>
  );
}

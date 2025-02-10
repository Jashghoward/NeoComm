"use client"

import React, { useState, useEffect } from "react";
import ChatComponent from "../components/ChatComponent";

const ChatPage = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [receiverId, setReceiverId] = useState("receiver_user_id_here"); // Replace with actual logic for getting receiver ID

  useEffect(() => {
    // Simulate fetching current user from local storage or an API
    const user = JSON.parse(localStorage.getItem("currentUser")); // Assuming you store user in local storage after login
    if (user) {
      setCurrentUser(user);
    } else {
      // Redirect or show error if not logged in
    }
  }, []);

  if (!currentUser) {
    return <div>Loading...</div>; // Or redirect to login if necessary
  }

  return (
    <div className="h-screen">
      <ChatComponent currentUser={currentUser} receiverId={receiverId} />
    </div>
  );
};

export default ChatPage;

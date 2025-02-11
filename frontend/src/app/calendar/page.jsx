"use client";
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const CalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8001/calendar/events', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setEvents(data.events);
    } catch (err) {
      console.error('Error fetching events:', err);
      toast.error('Failed to fetch calendar events');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Calendar</h1>
        
        {/* Calendar Grid */}
        <div className="bg-gray-800 rounded-lg p-6">
          {/* Calendar implementation will go here */}
          <p className="text-white">Calendar interface coming soon!</p>
        </div>
      </div>
    </div>
  );
};

export default CalendarPage; 
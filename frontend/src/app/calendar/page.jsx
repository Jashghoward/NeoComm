"use client";
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useRouter } from 'next/navigation';

const CalendarPage = () => {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    start: '',
    end: '',
    description: '',
    category: 'personal'
  });

  const eventCategories = [
    { id: 'work', name: 'Work', color: '#4285f4' },
    { id: 'personal', name: 'Personal', color: '#34a853' },
    { id: 'important', name: 'Important', color: '#ea4335' },
    { id: 'social', name: 'Social', color: '#fbbc05' }
  ];

  useEffect(() => {
    fetchGoogleEvents();
    
    // Refresh events every 5 minutes
    const interval = setInterval(fetchGoogleEvents, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchGoogleEvents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      console.log('Fetching events...');
      
      const response = await fetch('http://localhost:8001/calendar/events', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      console.log('Received events:', data.events?.length || 0);
      
      // Transform Google Calendar events to FullCalendar format
      const formattedEvents = data.events?.map(event => {
        console.log('Processing event:', event); // Debug log for each event
        return {
          id: event.id,
          title: event.summary,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          description: event.description,
          location: event.location,
          source: 'google',
          backgroundColor: '#4285f4',
          borderColor: '#4285f4',
          textColor: '#ffffff',
          allDay: !event.start?.dateTime // Check if it's an all-day event
        };
      }) || [];
      
      console.log('Formatted events:', formattedEvents);
      setEvents(formattedEvents);
    } catch (err) {
      console.error('Error fetching Google events:', err);
      toast.error('Failed to fetch calendar events');
    } finally {
      setLoading(false);
    }
  };

  const handleDateClick = (arg) => {
    // Convert the clicked date to local timezone and set time to start of day
    const clickedDate = new Date(arg.date);
    const localDateTime = new Date(clickedDate.getTime() - clickedDate.getTimezoneOffset() * 60000);
    
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const formattedStart = localDateTime.toISOString().slice(0, 16);
    
    // Set end time to 1 hour after start
    const endDateTime = new Date(localDateTime.getTime() + 60 * 60 * 1000);
    const formattedEnd = endDateTime.toISOString().slice(0, 16);

    console.log('Date clicked:', {
      original: arg.date,
      formatted: formattedStart,
      end: formattedEnd
    });

    setNewEvent({
      title: '',
      start: formattedStart,
      end: formattedEnd,
      description: '',
      category: 'personal'
    });
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (arg) => {
    const event = arg.event;
    console.log('Clicked event:', event); // Debug log
    
    // Format dates properly
    const startDate = event.start ? new Date(event.start) : new Date();
    const endDate = event.end ? new Date(event.end) : new Date(startDate.getTime() + 60 * 60 * 1000);
    
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const formattedStart = startDate.toISOString().slice(0, 16);
    const formattedEnd = endDate.toISOString().slice(0, 16);

    console.log('Setting event data:', {
      id: event.id,
      title: event.title,
      start: formattedStart,
      end: formattedEnd,
      description: event.extendedProps.description
    });

    setNewEvent({
      id: event.id,
      title: event.title,
      start: formattedStart,
      end: formattedEnd,
      description: event.extendedProps.description || '',
      category: event.extendedProps.category || 'personal'
    });
    
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      const startDate = new Date(newEvent.start);
      const endDate = new Date(newEvent.end);
      
      const eventData = {
        summary: newEvent.title,
        description: newEvent.description,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        category: newEvent.category
      };

      console.log('Creating event:', eventData);

      const response = await fetch('http://localhost:8001/calendar/create-event', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create event');
      }
      
      console.log('Event created:', data);
      toast.success('Event created successfully');
      setShowEventModal(false);
      
      // Immediately fetch updated events
      await fetchGoogleEvents();
    } catch (err) {
      console.error('Error creating event:', err);
      toast.error(err.message || 'Failed to create event');
    }
  };

  const handleUpdateEvent = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Not authenticated');
        return;
      }

      console.log('Updating event:', {
        id: selectedEvent.id,
        newData: newEvent
      });
      
      const eventData = {
        summary: newEvent.title,
        description: newEvent.description,
        start: {
          dateTime: new Date(newEvent.start).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: new Date(newEvent.end).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        category: newEvent.category
      };

      // First check if the server is accessible
      try {
        const healthCheck = await fetch('http://localhost:8001/health');
        if (!healthCheck.ok) {
          throw new Error('Server is not responding');
        }
      } catch (error) {
        console.error('Server health check failed:', error);
        toast.error('Cannot connect to server. Is it running?');
        return;
      }

      const response = await fetch(`http://localhost:8001/calendar/events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(eventData)
      });

      // Log the raw response
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('Raw response:', responseText);

      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (error) {
        console.error('Failed to parse response:', {
          error,
          responseText,
          status: response.status
        });
        toast.error('Server returned invalid response');
        return;
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update event');
      }
      
      toast.success('Event updated successfully');
      setShowEventModal(false);
      fetchGoogleEvents(); // Refresh events
    } catch (err) {
      console.error('Event update error:', err);
      toast.error(err.message || 'Failed to update event');
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8001/calendar/events/${selectedEvent.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete event');
      }
      
      toast.success('Event deleted successfully');
      setShowEventModal(false);
      fetchGoogleEvents(); // Refresh events
    } catch (err) {
      console.error('Error deleting event:', err);
      toast.error(err.message || 'Failed to delete event');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center text-white hover:text-blue-400 transition-colors"
            >
              <svg 
                className="w-6 h-6 mr-2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M10 19l-7-7m0 0l7-7m-7 7h18" 
                />
              </svg>
              Back to Home
            </button>
            <h1 className="text-3xl font-bold text-white">Calendar</h1>
          </div>
          <button
            onClick={() => {
              setSelectedEvent(null);
              setNewEvent({
                title: '',
                start: new Date().toISOString().slice(0, 16),
                end: new Date().toISOString().slice(0, 16),
                description: '',
                category: 'personal'
              });
              setShowEventModal(true);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Add Event
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="calendar-container dark-theme">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
              }}
              events={events}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              height="auto"
              themeSystem="standard"
              dayMaxEvents={true}
              nowIndicator={true}
              selectable={true}
              selectMirror={true}
              editable={false}
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
              }}
            />
          </div>
        </div>
      </div>

      {/* Event Modal with higher z-index */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <button
              onClick={() => setShowEventModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <h2 className="text-2xl font-bold text-white mb-4">
              {selectedEvent ? 'Edit Event' : 'Create Event'}
            </h2>
            
            <form onSubmit={selectedEvent ? handleUpdateEvent : handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Title</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full p-2 bg-gray-700 rounded text-white"
                  required
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">Start</label>
                <input
                  type="datetime-local"
                  value={newEvent.start}
                  onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
                  className="w-full p-2 bg-gray-700 rounded text-white"
                  required
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">End</label>
                <input
                  type="datetime-local"
                  value={newEvent.end}
                  onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
                  className="w-full p-2 bg-gray-700 rounded text-white"
                  required
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full p-2 bg-gray-700 rounded text-white"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-2">Category</label>
                <select
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                  className="w-full p-2 bg-gray-700 rounded text-white"
                >
                  {eventCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-between space-x-4 mt-6">
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  {selectedEvent && (
                    <button
                      type="button"
                      onClick={handleDeleteEvent}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  {selectedEvent ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage; 
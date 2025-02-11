"use client";
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const CalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    start: '',
    end: '',
    description: ''
  });

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
      description: ''
    });
    setSelectedEvent(null);
    setShowEventModal(true);
  };

  const handleEventClick = (arg) => {
    const event = arg.event;
    if (event.extendedProps.source === 'google') {
      // Open Google Calendar event in new tab
      window.open(`https://calendar.google.com/calendar/event?eid=${event.id}`, '_blank');
    } else {
      setSelectedEvent(event);
      setNewEvent({
        title: event.title,
        start: event.start?.toISOString().slice(0, 16) || '',
        end: event.end?.toISOString().slice(0, 16) || '',
        description: event.extendedProps.description || ''
      });
      setShowEventModal(true);
    }
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
        }
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

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Calendar</h1>
          <button
            onClick={() => {
              setSelectedEvent(null);
              setNewEvent({
                title: '',
                start: new Date().toISOString().slice(0, 16),
                end: new Date().toISOString().slice(0, 16),
                description: ''
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
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md relative">
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
            
            <form onSubmit={handleCreateEvent} className="space-y-4">
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
              
              <div className="flex justify-end space-x-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
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
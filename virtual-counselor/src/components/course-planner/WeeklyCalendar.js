import React, { useState, useEffect, useMemo } from 'react';
import { parseTimeRange, formatTimeRange, getContrastingTextColor } from './utils';

// Backwards compatibility map for previously stored Tailwind bg classes -> hex
const TAILWIND_TO_HEX = {
  'bg-red-600': '#dc2626',
  'bg-blue-600': '#2563eb',
  'bg-green-600': '#16a34a',
  'bg-purple-600': '#7c3aed',
  'bg-orange-500': '#f97316',
  'bg-teal-600': '#0ea5a4',
  'bg-pink-600': '#db2777',
  'bg-indigo-600': '#4f46e5',
  'bg-wsu-crimson': '#8b0000'
};

// Enhanced Weekly Calendar Component - 6am to 9pm, 15-minute blocks
function WeeklyCalendar({ courses, courseColors, onCourseClick }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayLetters = ['M', 'T', 'W', 'R', 'F'];

  // Generate hours from 6am to 9pm
  const hours = [];
  for (let h = 6; h <= 21; h++) {
    hours.push(h);
  }

  // Parse courses into calendar positions
  const calendarEvents = useMemo(() => {
    const events = [];

    courses.forEach(course => {
      const timeInfo = parseTimeRange(course.dayTime);
      if (!timeInfo) return;

      // Resolve stored color value (hex or gradient). Support legacy tailwind class mapping.
      const rawColor = courseColors[course.uniqueId] || 'bg-wsu-crimson';
      const colorValue = TAILWIND_TO_HEX[rawColor] || rawColor;
      const textColor = getContrastingTextColor(colorValue);

      timeInfo.days.forEach(dayLetter => {
        const dayIndex = dayLetters.indexOf(dayLetter);
        if (dayIndex === -1) return;
        // Round start down and end up to nearest 15-minute block so blocks align to grid
        const roundedStart = Math.floor(timeInfo.startMin / 15) * 15;
        const roundedEnd = Math.ceil(timeInfo.endMin / 15) * 15;

        // Calculate position and height
        // Each hour = 48px, 15 min = 12px
        const startHour = Math.floor(roundedStart / 60);
        const startMinute = roundedStart % 60;

        const topOffset = ((startHour - 6) * 48) + (startMinute / 15 * 12);
        const height = ((roundedEnd - roundedStart) / 15) * 12;

        events.push({
          course,
          dayIndex,
          topOffset,
          height,
          colorValue,
          textColor,
          timeDisplay: formatTimeRange(timeInfo.startMin, timeInfo.endMin)
        });
      });
    });

    return events;
  }, [courses, courseColors]);

  // Use compact calendar layout for screens up to 1024px (mobile + tablet)
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const m = window.matchMedia && window.matchMedia('(max-width: 1024px)');
    const update = () => setIsCompact(!!(m ? m.matches : window.innerWidth <= 1024));
    update();
    if (m && m.addEventListener) m.addEventListener('change', update);
    else if (m && m.addListener) m.addListener(update);
    return () => {
      if (m && m.removeEventListener) m.removeEventListener('change', update);
      else if (m && m.removeListener) m.removeListener(update);
    };
  }, []);

  const formatHour = (h) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  // Compact view for smaller screens (mobile/tablet): compact calendar grid
  if (isCompact) {
    const hourHeight = 80; // px per hour (slightly larger for readability)

    return (
      <div className="overflow-x-auto w-full">
        <div className="min-w-[425px]">
          {/* Header */}
          <div className="grid grid-cols-[50px_repeat(5,1fr)] border-b border-gray-300 bg-gray-50 sticky top-0 z-10">
            <div className="p-2 text-xs font-medium text-gray-500 border-r border-gray-200"></div>
            {days.map(day => (
              <div key={day} className="p-2 text-sm font-semibold text-gray-700 text-center border-r border-gray-200 last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="relative">
            {hours.map(hour => (
              <div key={hour} className="grid grid-cols-[50px_repeat(5,1fr)] border-b border-gray-200" style={{ height: `${hourHeight}px`,  border: '0.2px solid rgba(0, 0, 0, 0.12)' }}>
                <div className="p-1 text-xs text-gray-500 border-r border-gray-200 flex items-start justify-end pr-2 pt-0">
                  {formatHour(hour)}
                </div>
                {days.map((day) => (
                  <div key={day} className="border-r border-gray-300 last:border-r-0 relative" style={{border:'0.2px solid rgba(0, 0, 0, 0.12)'}}>
                    <div className="absolute w-full h-1/4 border-b border-gray-300"></div>
                    <div className="absolute w-full h-2/4 border-b border-gray-300"></div>
                    <div className="absolute w-full h-3/4 border-b border-gray-300"></div>
                  </div>
                ))}
              </div>
            ))}

            {/* Course blocks overlay */}
            <div className="absolute top-0 left-[50px] right-0 bottom-0">
              <div className="relative h-full grid grid-cols-5">
                {days.map((_, dayIndex) => (
                  <div key={dayIndex} className="relative">
                    {calendarEvents
                      .filter(e => e.dayIndex === dayIndex)
                      .map((event, idx) => {
                        // Recompute scaled positions for smaller hourHeight
                        const scaledTop = (event.topOffset / 48) * hourHeight;
                        const scaledHeight = (event.height / 48) * hourHeight;
                        const subject = (event.course.prefix || event.course.coursePrefix || '').toString();
                        const number = (event.course.courseNumber || '').toString();
                        const secondaryColor = event.textColor === '#fff' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)';
                        return (
                          <div
                            key={`${event.course.uniqueId}-${dayIndex}-${idx}`}
                            className={`absolute left-1 right-1 rounded-md shadow-sm cursor-pointer hover:opacity-95 transition-opacity overflow-hidden`}
                            style={{
                              top: `${scaledTop}px`,
                              height: `${Math.max(scaledHeight, 52)}px`,
                              background: event.colorValue,
                              color: event.textColor,
                              padding: '6px'
                            }}
                            onClick={() => onCourseClick(event.course)}
                            title={`${subject} ${number} - ${event.timeDisplay}${event.course.location ? ' - ' + event.course.location : ''}`}
                          >
                            <div className="flex flex-col h-full">
                              <div className="text-[11px] font-semibold leading-snug whitespace-normal" style={{ color: event.textColor }}>{subject} {number}</div>
                              <div className="text-[11px] leading-tight whitespace-normal" style={{ color: secondaryColor }}>{event.timeDisplay}</div>
                              {event.course.location && event.course.location !== 'ARR ARR' && (
                                <div className="text-[11px]" style={{ color: secondaryColor }}>{event.course.location}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop grid view
  return (
    <div className="relative min-w-[600px]">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-gray-300 bg-gray-50 sticky top-0 z-10">
        <div className="p-2 text-xs font-medium text-gray-500 border-r border-gray-200"></div>
        {days.map(day => (
          <div key={day} className="p-2 text-sm font-semibold text-gray-700 text-center border-r border-gray-200 last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="relative">
        {/* Hour rows */}
        {hours.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-gray-200" style={{ height: '48px' }}>
            <div className="p-1 text-xs text-gray-500 border-r border-gray-200 flex items-start justify-end pr-2 pt-0">
              {formatHour(hour)}
            </div>
            {days.map((day) => (
              <div key={day} className="border-r border-gray-300 last:border-r-0 relative">
                {/* 15-minute lines */}
                <div className="absolute w-full h-1/4 border-b border-gray-300"></div>
                <div className="absolute w-full h-2/4 border-b border-gray-300"></div>
                <div className="absolute w-full h-3/4 border-b border-gray-300"></div>
              </div>
            ))}
          </div>
        ))}

        {/* Course blocks overlay */}
        <div className="absolute top-0 left-[60px] right-0 bottom-0">
          <div className="relative h-full grid grid-cols-5">
            {days.map((_, dayIndex) => (
              <div key={dayIndex} className="relative">
                {calendarEvents
                  .filter(e => e.dayIndex === dayIndex)
                  .map((event, idx) => (
                    <div
                      key={`${event.course.uniqueId}-${dayIndex}-${idx}`}
                      className={`absolute left-1 right-1 rounded-md shadow-sm cursor-pointer hover:opacity-90 transition-opacity overflow-hidden`}
                      style={{
                        top: `${event.topOffset}px`,
                        height: `${Math.max(event.height, 24)}px`,
                        background: event.colorValue,
                        color: event.textColor
                      }}
                      onClick={() => onCourseClick(event.course)}
                    >
                      <div className="p-1 h-full flex flex-col">
                        <div className="font-semibold text-xs truncate">
                          {event.course.prefix || event.course.coursePrefix} {event.course.courseNumber}
                        </div>
                        {event.height >= 36 && (
                          <div className="text-xs opacity-90 truncate">
                            {event.timeDisplay}
                          </div>
                        )}
                        {event.height >= 48 && event.course.location && event.course.location !== 'ARR ARR' && (
                          <div className="text-xs opacity-75 truncate">
                            {event.course.location}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WeeklyCalendar;

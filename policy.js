function parseClock(value, fallbackMeridiem) {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] || fallbackMeridiem)?.toUpperCase();
  if (hour > 23 || minute > 59 || (meridiem && hour > 12)) return null;
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function parseWindow(windowLabel) {
  const parts = String(windowLabel).split('–').map(value => value.trim());
  if (parts.length !== 2) return null;
  const endMeridiem = parts[1].match(/(AM|PM)$/i)?.[1];
  const start = parseClock(parts[0], endMeridiem);
  const end = parseClock(parts[1]);
  if (start === null || end === null) return null;
  return { start, end };
}

function eventMinutes(event) {
  if (event.eventClock) {
    const [hour, minute] = event.eventClock.split(':').map(Number);
    return hour * 60 + minute;
  }
  const timestamp = event.occurredAt ? new Date(event.occurredAt) : new Date();
  return timestamp.getHours() * 60 + timestamp.getMinutes();
}

function formatClock(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

function evaluatePickup({ event, person, code, events }) {
  const window = parseWindow(person.window);
  const minutes = eventMinutes(event);
  const common = { personId: person.id, child: person.child, eventMinutes: minutes, window: person.window };

  if (String(code || '').trim() !== person.code) {
    return {
      ...common,
      status: 'code_invalid',
      label: 'Verification failed',
      title: 'Do not release',
      detail: `The code did not match ${person.name}'s secure claim code.`,
      nextAction: 'Ask the visitor to contact the authorized guardian.'
    };
  }

  const alreadyReleased = events.some(item => item.type === 'release' && item.person === person.id && item.child === person.child);
  if (alreadyReleased) {
    return {
      ...common,
      status: 'already_released',
      label: 'Duplicate release blocked',
      title: 'Already released',
      detail: `${person.child} already has a completed handoff recorded for ${person.name}.`,
      nextAction: 'Review the audit trail before taking another action.'
    };
  }

  if (window && minutes < window.start) {
    return {
      ...common,
      status: 'too_early',
      label: 'Pickup window not open',
      title: 'Too early to release',
      detail: `${person.name} is authorized, but the pickup window begins at ${formatClock(window.start)}.`,
      nextAction: `Wait until ${formatClock(window.start)} or contact the guardian.`
    };
  }

  if (window && minutes > window.end) {
    return {
      ...common,
      status: 'window_expired',
      label: 'Pickup window expired',
      title: 'Window expired',
      detail: `${person.name}'s pickup window ended at ${formatClock(window.end)}.`,
      nextAction: 'Contact the guardian before releasing the child.'
    };
  }

  return {
    ...common,
    status: 'approved',
    label: 'Handoff approved',
    title: 'Release approved',
    detail: `${person.name} is authorized to pick up ${person.child} within the active window.`,
    nextAction: 'Release the child and keep the handoff record.'
  };
}

module.exports = { parseWindow, eventMinutes, formatClock, evaluatePickup };

function unpackExtendedProperties(event) {
  if (!event.extendedProperties || !event.extendedProperties.private) {
    return event; // Return the event unchanged if no extendedProperties are found
  }

  const privateProps = { ...event.extendedProperties.private };
  log.info("Unpacking extended properties:", privateProps);

  // Conditionally parse the 'rooms' key
  if (privateProps.rooms && typeof privateProps.rooms === "string") {
    try {
      privateProps.rooms = JSON.parse(privateProps.rooms);
    } catch (error) {
      log.error("Error parsing 'rooms':", error);
    }
  }

  // Conditionally parse the 'originalRooms' key
  if (privateProps.originalRooms && typeof privateProps.originalRooms === "string") {
    try {
      privateProps.originalRooms = JSON.parse(privateProps.originalRooms);
    } catch (error) {
      log.error("Error parsing 'originalRooms':", error);
    }
  }

  // Return the updated event with unpacked extendedProperties
  return {
    ...event,
    extendedProperties: {
      ...event.extendedProperties,
      private: privateProps,
    },
  };
}

module.exports = { unpackExtendedProperties }
# Car_Rental_Erp
Car Rental Billing PWA
# Customer rental identity rule

A customer can be created with any combination of Civil ID, passport, and visa. Before a rental is confirmed, require a current driving licence, licence front/back images, customer signature, and at least one current identity document applicable to the customer. Booking/rental confirmation must call `assertCustomerCanBeBooked(customerId)` inside its transaction; it blocks active blacklist entries and returns the recorded reason.

class CHCScheduler {
    constructor() {
        this.providers = [];
        this.schedule = {};
        this.selectedMonth = null;
        this.holidays = this.initializeHolidays();
        this.dayRanking = this.initializeDayRanking();
        this.initializeEventListeners();
    }

    initializeHolidays() {
        return {
            'New Years': { month: 0, day: 1, fixed: true },
            'MLK Jr Day': { month: 0, day: 15, fixed: false, weekday: 1 }, // Third Monday of January
            'Presidents Day': { month: 1, day: 15, fixed: false, weekday: 1 }, // Third Monday of February
            'Memorial Day': { month: 4, day: 25, fixed: false, weekday: 1 }, // Last Monday of May
            'Independence Day': { month: 6, day: 4, fixed: true },
            'Labor Day': { month: 8, day: 1, fixed: false, weekday: 1 }, // First Monday of September
            'Thanksgiving': { month: 10, day: 22, fixed: false, weekday: 4 }, // Fourth Thursday of November
            'Day After Thanksgiving': { month: 10, day: 23, fixed: false, weekday: 5 }, // Day after Thanksgiving
            'Christmas Eve': { month: 11, day: 24, fixed: true },
            'Christmas Day': { month: 11, day: 25, fixed: true }
        };
    }

    initializeDayRanking() {
        // Day ranking for 3-provider priority: Monday, Tuesday, Friday, Wednesday, Thursday
        // Lower number = higher priority for 3 providers
        return {
            1: 1, // Monday - highest priority
            2: 2, // Tuesday - second priority
            5: 3, // Friday - third priority
            3: 4, // Wednesday - fourth priority
            4: 5, // Thursday - lowest priority
            6: 6, // Saturday - not ideal for 3 providers
            0: 7  // Sunday - clinic closed
        };
    }

    initializeEventListeners() {
        document.getElementById('generate-schedule').addEventListener('click', () => this.handleGenerateSchedule());
        document.getElementById('regenerate-schedule').addEventListener('click', () => this.handleGenerateSchedule());
        document.getElementById('export-schedule').addEventListener('click', () => this.exportSchedule());
        document.getElementById('excel-file').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('month-select').addEventListener('change', (e) => {
            this.selectedMonth = e.target.value;
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                this.parseProviderData(jsonData);
            } catch (error) {
                this.showError('Error reading Excel file: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    parseProviderData(data) {
        if (data.length < 2) {
            this.showError('Excel file must have at least a header row and one data row');
            return;
        }

        const headers = data[0].map(h => h ? h.toString().toLowerCase().trim() : '');
        const expectedHeaders = ['name', 'days per week', 'saturdays per month', 'preferred weekday off', 'shift preference', 'pto date', 'location'];
        
        // Find column indices
        const columnMap = {};
        expectedHeaders.forEach(expected => {
            const index = headers.findIndex(h => h.includes(expected) || expected.includes(h));
            if (index === -1) {
                this.showError(`Missing required column: ${expected}`);
                return;
            }
            columnMap[expected] = index;
        });

        this.providers = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row.length === 0 || !row[columnMap['name']]) continue;

            const location = row[columnMap['location']] ? row[columnMap['location']].toString().trim() : 'Central';
            
            // Validate location
            const validLocations = ['Central', 'Edmonds', 'Float'];
            if (!validLocations.includes(location)) {
                this.showError(`Invalid location "${location}" for provider "${row[columnMap['name']]}". Must be Central, Edmonds, or Float.`);
                continue;
            }

            const provider = {
                name: row[columnMap['name']].toString().trim(),
                daysPerWeek: parseInt(row[columnMap['days per week']]) || 0,
                saturdaysPerMonth: parseInt(row[columnMap['saturdays per month']]) || 0,
                preferredDaysOff: this.parseDayOfWeek(row[columnMap['preferred weekday off']]),
                shiftPreferences: this.parseShiftPreference(row[columnMap['shift preference']]),
                ptoDates: this.parsePTODates(row[columnMap['pto date']]),
                location: location
            };

            if (provider.name && provider.daysPerWeek > 0) {
                this.providers.push(provider);
            }
        }

        if (this.providers.length === 0) {
            this.showError('No valid provider data found in Excel file');
        }
    }

    parseDayOfWeek(dayStr) {
        if (!dayStr) return [];
        const days = dayStr.toString().split(',').map(d => d.trim().toLowerCase());
        const dayMap = {
            'monday': 1, 'mon': 1,
            'tuesday': 2, 'tue': 2, 'tues': 2,
            'wednesday': 3, 'wed': 3,
            'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
            'friday': 5, 'fri': 5,
            'saturday': 6, 'sat': 6,
            'sunday': 0, 'sun': 0
        };
        
        const parsedDays = days.map(day => dayMap[day]).filter(d => d !== undefined);
        return parsedDays.length > 0 ? parsedDays : [];
    }

    parseShiftPreference(prefStr) {
        if (!prefStr) return []; // Empty array indicates no preferences (they don't care)
        const prefs = prefStr.toString().split(',').map(p => p.trim().toLowerCase());
        const shiftMap = {
            'open': 'open', 'opening': 'open',
            'mid': 'mid', 'middle': 'mid',
            'close': 'close', 'closing': 'close'
        };
        
        const parsedPrefs = prefs.map(pref => shiftMap[pref]).filter(p => p !== undefined);
        return parsedPrefs.length > 0 ? parsedPrefs : []; // Empty array if no valid preferences
    }

    parsePTODates(ptoStr) {
        if (!ptoStr) return [];
        const dates = ptoStr.toString().split(',').map(d => d.trim()).filter(d => d);
        return dates.map(dateStr => {
            // Check if it's an Excel serial date (large number like 45965)
            const numericValue = parseFloat(dateStr);
            if (!isNaN(numericValue) && numericValue > 1000 && numericValue < 100000) {
                // Convert Excel serial date to JavaScript Date
                // Excel's epoch is January 1, 1900, but Excel incorrectly treats 1900 as a leap year
                // So we use December 30, 1899 as the actual epoch
                const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
                const date = new Date(excelEpoch.getTime() + (numericValue * 24 * 60 * 60 * 1000));
                return isNaN(date.getTime()) ? null : date;
            }
            
            // Parse date more reliably by handling MM/DD/YYYY and MM/DD/YY formats explicitly
            const fourDigitYearMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            const twoDigitYearMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
            
            if (fourDigitYearMatch) {
                const month = parseInt(fourDigitYearMatch[1]) - 1; // Convert to 0-indexed
                const day = parseInt(fourDigitYearMatch[2]);
                const year = parseInt(fourDigitYearMatch[3]);
                const date = new Date(year, month, day);
                return isNaN(date.getTime()) ? null : date;
            } else if (twoDigitYearMatch) {
                const month = parseInt(twoDigitYearMatch[1]) - 1; // Convert to 0-indexed
                const day = parseInt(twoDigitYearMatch[2]);
                let year = parseInt(twoDigitYearMatch[3]);
                
                // Convert 2-digit year to 4-digit year
                // Assume years 00-30 are 2000-2030, years 31-99 are 1931-1999
                if (year <= 30) {
                    year += 2000;
                } else {
                    year += 1900;
                }
                
                const date = new Date(year, month, day);
                return isNaN(date.getTime()) ? null : date;
            } else {
                // Fallback to original parsing for other formats
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? null : date;
            }
        }).filter(d => d);
    }

    isHoliday(date) {
        const month = date.getMonth();
        const day = date.getDate();
        const year = date.getFullYear();
        const dayOfWeek = date.getDay();

        for (const [holidayName, holiday] of Object.entries(this.holidays)) {
            if (holiday.month === month) {
                if (holiday.fixed) {
                    if (holiday.day === day) {
                        return { isHoliday: true, name: holidayName };
                    }
                } else {
                    // Calculate floating holidays
                    const holidayWithName = { ...holiday, name: holidayName };
                    const holidayDate = this.calculateFloatingHoliday(year, month, holidayWithName);
                    if (holidayDate && holidayDate.getDate() === day) {
                        return { isHoliday: true, name: holidayName };
                    }
                }
            }
        }

        return { isHoliday: false, name: null };
    }

    calculateFloatingHoliday(year, month, holiday) {
        // We need to pass the holiday name as a parameter since it's not available in the holiday object
        const holidayName = holiday.name || holiday.holidayName;
        
        if (holidayName === 'MLK Jr Day') {
            // Third Monday of January
            return this.getNthWeekdayOfMonth(year, month, 1, 3);
        } else if (holidayName === 'Presidents Day') {
            // Third Monday of February
            return this.getNthWeekdayOfMonth(year, month, 1, 3);
        } else if (holidayName === 'Memorial Day') {
            // Last Monday of May
            return this.getLastWeekdayOfMonth(year, month, 1);
        } else if (holidayName === 'Labor Day') {
            // First Monday of September
            return this.getNthWeekdayOfMonth(year, month, 1, 1);
        } else if (holidayName === 'Thanksgiving') {
            // Fourth Thursday of November
            return this.getNthWeekdayOfMonth(year, month, 4, 4);
        } else if (holidayName === 'Day After Thanksgiving') {
            // Day after Thanksgiving (Friday)
            const thanksgiving = this.getNthWeekdayOfMonth(year, month, 4, 4);
            if (thanksgiving) {
                const dayAfter = new Date(thanksgiving);
                dayAfter.setDate(dayAfter.getDate() + 1);
                return dayAfter;
            }
        }
        
        return null;
    }

    getNthWeekdayOfMonth(year, month, targetWeekday, n) {
        const firstDay = new Date(year, month, 1);
        const firstWeekday = firstDay.getDay();
        
        // Calculate the first occurrence of the target weekday
        let daysToAdd = (targetWeekday - firstWeekday + 7) % 7;
        const firstOccurrence = new Date(year, month, 1 + daysToAdd);
        
        // Add (n-1) weeks to get the nth occurrence
        const nthOccurrence = new Date(firstOccurrence);
        nthOccurrence.setDate(firstOccurrence.getDate() + (n - 1) * 7);
        
        // Make sure we're still in the same month
        if (nthOccurrence.getMonth() === month) {
            return nthOccurrence;
        }
        
        return null;
    }

    getLastWeekdayOfMonth(year, month, targetWeekday) {
        const lastDay = new Date(year, month + 1, 0); // Last day of the month
        const lastWeekday = lastDay.getDay();
        
        // Calculate days to subtract to get to the last occurrence of target weekday
        let daysToSubtract = (lastWeekday - targetWeekday + 7) % 7;
        const lastOccurrence = new Date(lastDay);
        lastOccurrence.setDate(lastDay.getDate() - daysToSubtract);
        
        return lastOccurrence;
    }

    handleGenerateSchedule() {
        if (!this.selectedMonth) {
            this.showError('Please select a month to schedule');
            return;
        }

        if (this.providers.length === 0) {
            this.showError('Please upload an Excel file with provider data first');
            return;
        }

        this.showLoading();
        setTimeout(() => {
            try {
                this.generateSchedule();
                this.displaySchedule();
                this.hideLoading();
            } catch (error) {
                this.hideLoading();
                this.showError('Error generating schedule: ' + error.message);
            }
        }, 1000);
    }

    generateSchedule() {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1; // JavaScript months are 0-indexed
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Separate providers by location
        const providersByLocation = this.separateProvidersByLocation();
        
        // Initialize schedule structure for each location
        const schedule = {};
        
        // Initialize schedule structure for each location
        for (const location in providersByLocation) {
            schedule[location] = {};
            
            // Initialize schedule structure for this location (skip Sundays since clinic is closed)
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay();
                
                // Skip Sundays - clinic is closed
                if (dayOfWeek === 0) continue;
                
                const holidayInfo = this.isHoliday(date);
                
                schedule[location][day] = {
                    date: date,
                    dayOfWeek: dayOfWeek,
                    shifts: { open: [], mid: [], close: [] },
                    isWeekend: dayOfWeek === 6, // Only Saturday is weekend now
                    isHoliday: holidayInfo.isHoliday,
                    holidayName: holidayInfo.name
                };
            }
        }

        // Distribute shifts with float provider support
        this.distributeShiftsWithFloatSupport(schedule, providersByLocation, year, month);

        this.schedule = schedule;
    }

    separateProvidersByLocation() {
        const providersByLocation = {};
        const floatProviders = [];
        
        // Separate regular providers by location and collect float providers
        for (const provider of this.providers) {
            if (provider.location === 'Float') {
                floatProviders.push(provider);
            } else {
                const location = provider.location || 'Central';
                if (!providersByLocation[location]) {
                    providersByLocation[location] = [];
                }
                providersByLocation[location].push(provider);
            }
        }
        
        // Store float providers separately for dynamic assignment
        this.floatProviders = floatProviders;
        
        return providersByLocation;
    }

    distributeShiftsWithFloatSupport(schedule, providersByLocation, year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Create working copies of all providers
        const allProviders = [];
        const locationProviders = {};
        
        // Initialize working providers for each location
        for (const location in providersByLocation) {
            locationProviders[location] = providersByLocation[location].map(p => ({
                ...p,
                assignedDays: 0,
                assignedSaturdays: 0,
                assignedHolidays: 0,
                currentShifts: [],
                location: location
            }));
            allProviders.push(...locationProviders[location]);
        }
        
        // Create shared float provider tracking (CRITICAL: Float providers need shared counters)
        const sharedFloatProviders = {};
        if (this.floatProviders && this.floatProviders.length > 0) {
            this.floatProviders.forEach(p => {
                sharedFloatProviders[p.name] = {
                    ...p,
                    assignedDays: 0,
                    assignedSaturdays: 0,
                    assignedHolidays: 0,
                    currentShifts: [],
                    location: 'Float',
                    isFloat: true
                };
                allProviders.push(sharedFloatProviders[p.name]);
            });
        }
        
        // Store shared float providers for cross-location tracking
        this.sharedFloatProviders = sharedFloatProviders;
        
        // First, handle holidays for all providers
        for (const location in schedule) {
            for (const day in schedule[location]) {
                const dayData = schedule[location][day];
                if (dayData.isHoliday) {
                    // All providers at this location get holiday credit
                    locationProviders[location].forEach(provider => {
                        provider.assignedDays++;
                        provider.assignedHolidays++;
                        provider.currentShifts.push({ day: parseInt(day), shiftType: 'holiday' });
                    });
                    dayData.shifts.holiday = [dayData.holidayName];
                }
            }
        }
        
        // Now handle regular shifts with float provider logic
        this.distributeRegularShiftsWithFloats(schedule, locationProviders, allProviders, daysInMonth);
    }

    distributeRegularShiftsWithFloats(schedule, locationProviders, allProviders, daysInMonth) {
        // Use the original Saturday-first approach but with float provider support
        for (const location in schedule) {
            this.distributeShiftsWithRankingForLocationWithFloats(schedule[location], locationProviders[location], allProviders);
        }
    }

    distributeShiftsWithRankingForLocationWithFloats(schedule, locationProviders, allProviders) {
        // Create working providers for this location
        const workingProviders = locationProviders.map(p => ({
            ...p,
            assignedDays: 0,
            assignedSaturdays: 0,
            assignedHolidays: 0,
            currentShifts: []
        }));

        // Add shared float providers to the working providers list (CRITICAL: Use shared tracking)
        if (this.sharedFloatProviders) {
            Object.values(this.sharedFloatProviders).forEach(floatProvider => {
                workingProviders.push(floatProvider);
            });
        }

        // Use the original Saturday-first logic
        this.distributeShiftsWithRankingForLocation(schedule, workingProviders);
    }

    // Helper method to assign a provider to a shift and update shared float provider tracking
    assignProviderToShiftWithFloatTracking(provider, dayData, shiftType, day) {
        if (provider.isFloat && this.sharedFloatProviders && this.sharedFloatProviders[provider.name]) {
            // Update the shared float provider tracking
            const sharedProvider = this.sharedFloatProviders[provider.name];
            sharedProvider.assignedDays++;
            sharedProvider.currentShifts.push({ day: day, shiftType: shiftType });
            
            // Also update the local provider reference
            provider.assignedDays++;
            provider.currentShifts.push({ day: day, shiftType: shiftType });
            
            // Add to the shift assignment
            dayData.shifts[shiftType].push(provider.name);
        } else {
            // Regular provider assignment
            provider.assignedDays++;
            provider.currentShifts.push({ day: day, shiftType: shiftType });
            dayData.shifts[shiftType].push(provider.name);
        }
    }

    selectProviderForShiftWithFloats(providers, dayData, shiftType, isSaturday, location) {
        // Special handling for Saturday shifts
        if (isSaturday) {
            return this.selectSaturdayProviderWithFloats(providers, dayData, shiftType, location);
        }
        
        // Regular weekday logic
        const availableProviders = providers.filter(p => {
            // Check if already assigned today
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            if (assignedToday) return false;

            // Check PTO
            const isOnPTO = p.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            if (isOnPTO) return false;

            // Check preferred days off
            if (p.preferredDaysOff.includes(dayData.dayOfWeek)) return false;

            // Check days per week limit
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            if (daysWorkedThisWeek >= p.daysPerWeek) return false;

            return true;
        });

        if (availableProviders.length === 0) return null;

        // Score and select best provider using the new preference logic
        const scoredProviders = availableProviders.map(provider => {
            let score = 0;
            
            // Calculate days per week progress
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(provider, dayData.date);
            const daysNeededThisWeek = provider.daysPerWeek;
            const daysRemainingThisWeek = daysNeededThisWeek - daysWorkedThisWeek;
            
            // Prefer providers who need more days to reach their weekly target (but don't override preferences)
            if (daysRemainingThisWeek > 0) {
                score += daysRemainingThisWeek * 10; // Moderate priority for providers who need days
            } else {
                // If they've reached their weekly limit, they shouldn't be available anyway
                score += -100; // Penalty for providers at their limit
            }

            // Prefer providers who haven't worked as much overall (secondary factor)
            score += (10 - provider.assignedDays) * 5;

            // Prefer shift preference match (check in order of preference)
            const shiftPreferenceIndex = provider.shiftPreferences.indexOf(shiftType);
            if (shiftPreferenceIndex !== -1) {
                // 1st preference gets highest score, 2nd gets medium, 3rd gets very low (last resort)
                if (shiftPreferenceIndex === 0) {
                    score += 200; // Highest priority for 1st preference
                } else if (shiftPreferenceIndex === 1) {
                    score += 100; // Medium priority for 2nd preference
                } else if (shiftPreferenceIndex === 2) {
                    score += 10; // Very low priority for 3rd preference (absolute last resort)
                } else {
                    score += 1; // Minimal score for any other preferences
                }
            } else if (provider.shiftPreferences.length === 0) {
                // Person has no preferences (empty shift preferences column) - they don't care
                // Give them a moderate score, but lower than people with explicit preferences
                score += 25;
            } else {
                // Person has preferences but this shift type isn't in them
                // This is worse than having no preferences at all
                score += Math.random() * 5;
            }

            // Random factor to break ties
            score += Math.random() * 10;
            
            return { provider, score };
        });

        // Sort by score and return best provider
        scoredProviders.sort((a, b) => b.score - a.score);
        return scoredProviders[0].provider;
    }

    selectSaturdayProviderWithFloats(providers, dayData, shiftType, location) {
        // First, try to find providers who WANT Saturdays and haven't reached their limit
        const saturdayWanters = providers.filter(p => {
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            const isOnPTO = p.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            const isPreferredDayOff = p.preferredDaysOff.includes(dayData.dayOfWeek);
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            const saturdayLimitExceeded = p.assignedSaturdays >= p.saturdaysPerMonth;
            
            return !assignedToday && !isOnPTO && !isPreferredDayOff && 
                   daysWorkedThisWeek < p.daysPerWeek && !saturdayLimitExceeded &&
                   p.saturdaysPerMonth >= 2; // Only providers who WANT Saturdays
        });
        
        let provider = null;
        
        if (saturdayWanters.length > 0) {
            // Score and select from providers who WANT Saturdays
            const scoredProviders = saturdayWanters.map(p => {
                let score = 0;
                const saturdaysNeeded = p.saturdaysPerMonth - p.assignedSaturdays;
                score += saturdaysNeeded * 200; // Very high priority for Saturday wanters
                
                // Prefer shift preference match
                const shiftPreferenceIndex = p.shiftPreferences.indexOf(shiftType);
                if (shiftPreferenceIndex !== -1) {
                    // 1st preference gets highest score, 2nd gets medium, 3rd gets very low (last resort)
                    if (shiftPreferenceIndex === 0) {
                        score += 200; // Highest priority for 1st preference
                    } else if (shiftPreferenceIndex === 1) {
                        score += 100; // Medium priority for 2nd preference
                    } else if (shiftPreferenceIndex === 2) {
                        score += 10; // Very low priority for 3rd preference (absolute last resort)
                    } else {
                        score += 1; // Minimal score for any other preferences
                    }
                } else if (p.shiftPreferences.length === 0) {
                    // Person has no preferences (empty shift preferences column) - they don't care
                    // Give them a moderate score, but lower than people with explicit preferences
                    score += 25;
                } else {
                    // Person has preferences but this shift type isn't in them
                    // This is worse than having no preferences at all
                    score += Math.random() * 5;
                }
                
                return { provider: p, score };
            });
            
            scoredProviders.sort((a, b) => b.score - a.score);
            provider = scoredProviders[0].provider;
        }
        
        // If no Saturday wanters available, try normal selection
        if (!provider) {
            const availableProviders = providers.filter(p => {
                const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
                const isOnPTO = p.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                });
                const isPreferredDayOff = p.preferredDaysOff.includes(dayData.dayOfWeek);
                const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
                const saturdayLimitExceeded = p.assignedSaturdays >= p.saturdaysPerMonth;
                
                return !assignedToday && !isOnPTO && !isPreferredDayOff && 
                       daysWorkedThisWeek < p.daysPerWeek && !saturdayLimitExceeded;
            });
            
            if (availableProviders.length > 0) {
                const scoredProviders = availableProviders.map(p => {
                    let score = 0;
                    score += (10 - p.assignedDays) * 10;
                    
                    const prefIndex = p.shiftPreferences.indexOf(shiftType);
                    if (prefIndex !== -1) {
                        score += (p.shiftPreferences.length - prefIndex) * 20;
                    } else {
                        score += Math.random() * 5;
                    }
                    
                    if (p.assignedSaturdays < p.saturdaysPerMonth) {
                        score += 30;
                    }
                    
                    score += Math.random() * 10;
                    return { provider: p, score };
                });
                
                scoredProviders.sort((a, b) => b.score - a.score);
                provider = scoredProviders[0].provider;
            }
        }
        
        // If still no provider, use emergency fallback
        if (!provider) {
            const emergencyProviders = providers.filter(p => {
                const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
                const isOnPTO = p.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                });
                return !assignedToday && !isOnPTO;
            });
            
            if (emergencyProviders.length > 0) {
                provider = emergencyProviders[Math.floor(Math.random() * emergencyProviders.length)];
            }
        }
        
        return provider;
    }


    distributeShiftsWithRankingForLocation(schedule, workingProviders) {
        // NEW LOGIC: Prioritize Saturday assignments for providers who WANT to work Saturdays (2+)
        // This ensures they get their preferred Saturday shifts before being assigned weekdays
        
        // First, get all non-holiday days and separate Saturdays from weekdays
        const saturdaysToSchedule = [];
        const weekdaysToSchedule = [];
        
        for (const day in schedule) {
            const dayData = schedule[day];
            if (!dayData.isHoliday) {
                if (dayData.dayOfWeek === 6) {
                    // Saturday
                    saturdaysToSchedule.push({
                        day: parseInt(day),
                        dayData: dayData
                    });
                } else {
                    // Weekday
                    weekdaysToSchedule.push({
                        day: parseInt(day),
                        dayData: dayData,
                        ranking: this.dayRanking[dayData.dayOfWeek] || 999
                    });
                }
            }
        }
        
        // Sort weekdays by ranking (lower number = higher priority for 3 providers)
        weekdaysToSchedule.sort((a, b) => a.ranking - b.ranking);
        
        // STEP 1: Assign ALL Saturday shifts FIRST
        // This ensures providers who want Saturdays get them before being assigned weekdays
        console.log('Assigning Saturday shifts first...');
        for (const { day, dayData } of saturdaysToSchedule) {
            this.assignSaturdayShift(workingProviders, dayData, day);
        }
        
        // STEP 2: Assign weekday shifts
        // Now assign weekdays, with providers who got their Saturday preferences having less weekday availability
        console.log('Assigning weekday shifts...');
        for (const { day, dayData } of weekdaysToSchedule) {
            const isThursday = dayData.dayOfWeek === 4;

            // Thursday: only mid shift, target 2 providers, allow 3 if needed, allow 1 if no other options
            if (isThursday) {
                this.assignThursdayShifts(workingProviders, dayData, day);
            } else {
                // Other weekdays: prioritize open and close shifts before mid shift
                this.assignWeekdayShifts(workingProviders, dayData, day);
            }
        }
    }

    getWeekdaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let weekdays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayOfWeek = new Date(year, month, day).getDay();
            // Count Monday-Friday only (exclude Sunday and Saturday)
            if (dayOfWeek >= 1 && dayOfWeek <= 5) weekdays++;
        }
        return weekdays;
    }

    getSaturdaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let saturdays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayOfWeek = new Date(year, month, day).getDay();
            if (dayOfWeek === 6) saturdays++;
        }
        return saturdays;
    }

    getHolidaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let holidays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            
            // Skip Sundays - clinic is closed
            if (dayOfWeek === 0) continue;
            
            const holidayInfo = this.isHoliday(date);
            if (holidayInfo.isHoliday) {
                holidays++;
            }
        }
        return holidays;
    }

    distributeShifts(schedule, totalShifts) {
        // Create a working copy of providers with current assignments
        const workingProviders = this.providers.map(p => ({
            ...p,
            assignedDays: 0,
            assignedSaturdays: 0,
            assignedHolidays: 0,
            currentShifts: []
        }));

        // First, give ALL providers credit for holidays
        for (const day in schedule) {
            const dayData = schedule[day];
            const isHoliday = dayData.isHoliday;

            if (isHoliday) {
                // ALL providers get credit for holidays - no actual work but counts as a shift
                workingProviders.forEach(provider => {
                    provider.assignedDays++;
                    provider.assignedHolidays++;
                    provider.currentShifts.push({ day: parseInt(day), shiftType: 'holiday' });
                });
                // Mark this as a holiday for display purposes
                dayData.shifts.holiday = [dayData.holidayName];
            }
        }

        // Then distribute regular work shifts with day ranking consideration
        this.distributeShiftsWithRanking(schedule, workingProviders);
    }

    distributeShiftsWithRanking(schedule, workingProviders) {
        // NEW LOGIC: Prioritize Saturday assignments for providers who WANT to work Saturdays (2+)
        // This ensures they get their preferred Saturday shifts before being assigned weekdays
        
        // First, get all non-holiday days and separate Saturdays from weekdays
        const saturdaysToSchedule = [];
        const weekdaysToSchedule = [];
        
        for (const day in schedule) {
            const dayData = schedule[day];
            if (!dayData.isHoliday) {
                if (dayData.dayOfWeek === 6) {
                    // Saturday
                    saturdaysToSchedule.push({
                        day: parseInt(day),
                        dayData: dayData
                    });
                } else {
                    // Weekday
                    weekdaysToSchedule.push({
                        day: parseInt(day),
                        dayData: dayData,
                        ranking: this.dayRanking[dayData.dayOfWeek] || 999
                    });
                }
            }
        }
        
        // Sort weekdays by ranking (lower number = higher priority for 3 providers)
        weekdaysToSchedule.sort((a, b) => a.ranking - b.ranking);
        
        // STEP 1: Assign ALL Saturday shifts FIRST
        // This ensures providers who want Saturdays get them before being assigned weekdays
        console.log('Assigning Saturday shifts first...');
        for (const { day, dayData } of saturdaysToSchedule) {
            this.assignSaturdayShift(workingProviders, dayData, day);
        }
        
        // STEP 2: Assign weekday shifts
        // Now assign weekdays, with providers who got their Saturday preferences having less weekday availability
        console.log('Assigning weekday shifts...');
        for (const { day, dayData } of weekdaysToSchedule) {
            const isThursday = dayData.dayOfWeek === 4;

            // Thursday: only mid shift, target 2 providers, allow 3 if needed, allow 1 if no other options
            if (isThursday) {
                this.assignThursdayShifts(workingProviders, dayData, day);
            } else {
                // Other weekdays: prioritize open and close shifts before mid shift
                this.assignWeekdayShifts(workingProviders, dayData, day);
            }
        }
    }

    assignThursdayShifts(workingProviders, dayData, day) {
        // Thursday constraints: only mid shift, target 2 providers, allow 3 if needed, allow 1 if no other options
        
        let assignedProviders = 0;
        
        // First, try to get 2 providers for Thursday mid shift (ideal case)
        for (let i = 0; i < 2; i++) {
            const provider = this.selectProviderForShift(workingProviders, dayData, 'mid', false);
            if (provider) {
                dayData.shifts.mid.push(provider.name);
                provider.assignedDays++;
                provider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            } else {
                break; // No more available providers
            }
        }
        
        // If we got exactly 2 providers, we're done (ideal case)
        if (assignedProviders === 2) {
            return;
        }
        
        // If we got 0 or 1 providers, try to get 1 more if possible (up to 3 total)
        if (assignedProviders < 2) {
            const additionalProvider = this.selectProviderForShift(workingProviders, dayData, 'mid', false);
            if (additionalProvider) {
                dayData.shifts.mid.push(additionalProvider.name);
                additionalProvider.assignedDays++;
                additionalProvider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            }
        }
        
        // If we still have 0 providers, try emergency fallback
        if (assignedProviders === 0) {
            const fallbackProvider = this.selectProviderForEmergencyFallback(workingProviders, dayData, 'mid', false);
            if (fallbackProvider) {
                dayData.shifts.mid.push(fallbackProvider.name);
                fallbackProvider.assignedDays++;
                fallbackProvider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            }
        }
    }

    assignSaturdayShift(workingProviders, dayData, day) {
        // Saturday: only 1 provider assigned to "mid" shift
        // PRIORITY: Providers who WANT Saturdays (2+) get first priority
        // CRITICAL: Saturday coverage is mandatory - must find someone
        
        // First, try to find providers who WANT Saturdays and haven't reached their limit
        const saturdayWanters = workingProviders.filter(p => {
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            const isOnPTO = p.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            const isPreferredDayOff = p.preferredDaysOff.includes(dayData.dayOfWeek);
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            const saturdayLimitExceeded = p.assignedSaturdays >= p.saturdaysPerMonth;
            
            return !assignedToday && !isOnPTO && !isPreferredDayOff && 
                   daysWorkedThisWeek < p.daysPerWeek && !saturdayLimitExceeded &&
                   p.saturdaysPerMonth >= 2; // Only providers who WANT Saturdays
        });
        
        let provider = null;
        
        if (saturdayWanters.length > 0) {
            // Score and select from providers who WANT Saturdays
            const scoredProviders = saturdayWanters.map(p => {
                let score = 0;
                const saturdaysNeeded = p.saturdaysPerMonth - p.assignedSaturdays;
                score += saturdaysNeeded * 200; // Very high priority for Saturday wanters
                
                // Prefer shift preference match
                const shiftPreferenceIndex = p.shiftPreferences.indexOf('mid');
                if (shiftPreferenceIndex !== -1) {
                    // 1st preference gets highest score, 2nd gets medium, 3rd gets very low (last resort)
                    if (shiftPreferenceIndex === 0) {
                        score += 200; // Highest priority for 1st preference
                    } else if (shiftPreferenceIndex === 1) {
                        score += 100; // Medium priority for 2nd preference
                    } else if (shiftPreferenceIndex === 2) {
                        score += 10; // Very low priority for 3rd preference (absolute last resort)
                    } else {
                        score += 1; // Minimal score for any other preferences
                    }
                } else if (p.shiftPreferences.length === 0) {
                    // Person has no preferences (empty shift preferences column) - they don't care
                    // Give them a moderate score, but lower than people with explicit preferences
                    score += 25;
                } else {
                    // Person has preferences but this shift type isn't in them
                    // This is worse than having no preferences at all
                    score += Math.random() * 5;
                }
                
                return { provider: p, score };
            });
            
            scoredProviders.sort((a, b) => b.score - a.score);
            provider = scoredProviders[0].provider;
        }
        
        // If no Saturday wanters available, try normal selection
        if (!provider) {
            provider = this.selectProviderForShift(workingProviders, dayData, 'mid', true);
        }
        
        // If no provider found with normal criteria, use emergency fallback
        if (!provider) {
            provider = this.selectProviderForEmergencyFallback(workingProviders, dayData, 'mid', true);
        }
        
        // If still no provider, use the most desperate fallback - any available provider
        if (!provider) {
            const anyAvailableProvider = workingProviders.find(p => {
                const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
                const isOnPTO = p.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                });
                return !assignedToday && !isOnPTO;
            });
            
            if (anyAvailableProvider) {
                provider = anyAvailableProvider;
            }
        }
        
        if (provider) {
            this.assignProviderToShiftWithFloatTracking(provider, dayData, 'mid', day);
            provider.assignedSaturdays++;
            console.log(`Saturday ${day}: Assigned to ${provider.name} (wants ${provider.saturdaysPerMonth} Saturdays, has ${provider.assignedSaturdays})`);
        } else {
            console.warn(`CRITICAL: No provider available for Saturday ${day} - this should not happen!`);
        }
    }

    assignWeekdayShifts(workingProviders, dayData, day) {
        // Weekday constraints: be more conservative to leave room for Saturday coverage
        // Target 2-3 providers per day, but prioritize Saturday availability
        // Use emergency fallback if no providers meet normal criteria
        
        // Calculate how many providers we should assign based on available capacity
        const availableProviders = workingProviders.filter(p => {
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            const isOnPTO = p.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            const isPreferredDayOff = p.preferredDaysOff.includes(dayData.dayOfWeek);
            
            return !assignedToday && !isOnPTO && !isPreferredDayOff && daysWorkedThisWeek < p.daysPerWeek;
        });
        
        // Be more conservative - only assign 2 providers if we have limited availability
        // This leaves more room for Saturday coverage
        const maxProviders = availableProviders.length >= 4 ? 3 : 2;
        let assignedProviders = 0;
        
        // First, assign open shift (highest priority)
        let openProvider = this.selectProviderForShift(workingProviders, dayData, 'open', false);
        if (!openProvider) {
            openProvider = this.selectProviderForEmergencyFallback(workingProviders, dayData, 'open', false);
        }
        if (openProvider) {
            this.assignProviderToShiftWithFloatTracking(openProvider, dayData, 'open', day);
            assignedProviders++;
        }
        
        // Second, assign close shift (second priority)
        let closeProvider = this.selectProviderForShift(workingProviders, dayData, 'close', false);
        if (!closeProvider) {
            closeProvider = this.selectProviderForEmergencyFallback(workingProviders, dayData, 'close', false);
        }
        if (closeProvider) {
            this.assignProviderToShiftWithFloatTracking(closeProvider, dayData, 'close', day);
            assignedProviders++;
        }
        
        // Finally, assign mid shift (lowest priority) - only if we haven't reached max providers
        if (assignedProviders < maxProviders) {
            let midProvider = this.selectProviderForShift(workingProviders, dayData, 'mid', false);
            if (!midProvider) {
                midProvider = this.selectProviderForEmergencyFallback(workingProviders, dayData, 'mid', false);
            }
            if (midProvider) {
                this.assignProviderToShiftWithFloatTracking(midProvider, dayData, 'mid', day);
                assignedProviders++;
            }
        }
    }


    getDaysWorkedThisWeek(provider, currentDate) {
        // Calculate how many days this provider has worked in the current week
        // This includes ALL shifts (weekdays AND Saturdays) - days per week is total shifts per week
        // Week starts on Sunday (day 0) and ends on Saturday (day 6)
        
        const currentDayOfWeek = currentDate.getDay();
        const currentDay = currentDate.getDate();
        
        // Calculate the start of the current week (Sunday)
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDay - currentDayOfWeek);
        
        // Count days worked in the current week (including Saturdays)
        let daysWorkedThisWeek = 0;
        
        for (let i = 0; i < 7; i++) {
            const weekDay = new Date(startOfWeek);
            weekDay.setDate(startOfWeek.getDate() + i);
            const weekDayNum = weekDay.getDate();
            
            // Check if provider worked on this day (any shift type)
            const workedThisDay = provider.currentShifts.some(shift => shift.day === weekDayNum);
            if (workedThisDay) {
                daysWorkedThisWeek++;
            }
        }
        
        return daysWorkedThisWeek;
    }

    selectProviderForEmergencyFallback(providers, dayData, shiftType, isSaturday) {
        // Emergency fallback method when no providers meet normal criteria
        // This ensures clinic coverage by relaxing constraints as needed
        // BUT NEVER exceeds days per week limits - this is a hard constraint
        
        const availableProviders = providers.filter(p => {
            // Check if already assigned today
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            if (assignedToday) return false;

            // Check PTO - still enforce this as it's a hard constraint
            const isOnPTO = p.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            if (isOnPTO) return false;

            // Check days per week limit - NEVER exceed this, even in emergency
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            if (daysWorkedThisWeek >= p.daysPerWeek) return false;

            // For emergency fallback, we'll ignore:
            // - Preferred days off
            // - Saturday limits
            // But we STILL enforce days per week limits
            return true;
        });

        if (availableProviders.length === 0) {
            // If no providers available due to days per week constraints,
            // find the provider who is closest to their limit but hasn't reached it
            const allProviders = providers.filter(p => {
                const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
                if (assignedToday) return false;

                const isOnPTO = p.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                });
                if (isOnPTO) return false;

                return true;
            });

            if (allProviders.length === 0) return null;

            // Find provider closest to their days per week limit
            const closestToLimit = allProviders.reduce((closest, current) => {
                const currentDaysWorked = this.getDaysWorkedThisWeek(current, dayData.date);
                const closestDaysWorked = this.getDaysWorkedThisWeek(closest, dayData.date);
                
                // If current provider is closer to their limit, use them
                if (currentDaysWorked > closestDaysWorked) {
                    return current;
                }
                return closest;
            });

            // Only return this provider if they haven't reached their limit
            const daysWorked = this.getDaysWorkedThisWeek(closestToLimit, dayData.date);
            if (daysWorked < closestToLimit.daysPerWeek) {
                return closestToLimit;
            }

            return null;
        }

        // Score providers - prefer those who haven't worked as much overall
        const scoredProviders = availableProviders.map(p => {
            let score = 0;

            // Prefer providers who haven't worked as much overall
            score += (10 - p.assignedDays) * 5;

            // Prefer shift preference match
            const shiftPreferenceIndex = p.shiftPreferences.indexOf(shiftType);
            if (shiftPreferenceIndex !== -1) {
                // 1st preference gets highest score, 2nd gets medium, 3rd gets very low (last resort)
                if (shiftPreferenceIndex === 0) {
                    score += 100; // Highest priority for 1st preference
                } else if (shiftPreferenceIndex === 1) {
                    score += 50; // Medium priority for 2nd preference
                } else if (shiftPreferenceIndex === 2) {
                    score += 5; // Very low priority for 3rd preference (absolute last resort)
                } else {
                    score += 1; // Minimal score for any other preferences
                }
            } else if (p.shiftPreferences.length === 0) {
                // Person has no preferences (empty shift preferences column) - they don't care
                // Give them a moderate score, but lower than people with explicit preferences
                score += 15;
            } else {
                // Person has preferences but this shift type isn't in them
                // This is worse than having no preferences at all
                score += Math.random() * 5;
            }

            // For Saturday assignments in emergency fallback, follow the same priority logic
            if (isSaturday) {
                const saturdaysNeeded = p.saturdaysPerMonth - p.assignedSaturdays;
                
                if (p.saturdaysPerMonth >= 2) {
                    // Providers who WANT to work Saturdays (2+ requested)
                    if (saturdaysNeeded > 0) {
                        score += saturdaysNeeded * 100; // High priority for providers who WANT Saturday shifts
                    } else {
                        score += -50; // Penalty for providers who have reached their desired Saturday limit
                    }
                } else if (p.saturdaysPerMonth === 1) {
                    // Providers who don't WANT to work Saturdays but can be assigned if needed
                    if (saturdaysNeeded > 0) {
                        score += 25; // Lower priority for providers who don't want Saturday shifts
                    } else {
                        score += -100; // Strong penalty for providers who don't want Saturday shifts and have been assigned
                    }
                }
            }

            // Random factor to break ties
            score += Math.random() * 10;

            return { provider: p, score };
        });

        // Sort by score and return the best provider
        scoredProviders.sort((a, b) => b.score - a.score);
        return scoredProviders[0].provider;
    }

    selectProviderForShift(providers, dayData, shiftType, isSaturday) {
        // Filter available providers
        const availableProviders = providers.filter(p => {
            // Check if already assigned today
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            if (assignedToday) return false;

            // Check PTO - use more robust date comparison
            const isOnPTO = p.ptoDates.some(ptoDate => {
                // Normalize both dates to midnight to avoid time component issues
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            if (isOnPTO) return false;

            // Check if it's a preferred day off (any of their preferences)
            if (p.preferredDaysOff.includes(dayData.dayOfWeek)) return false;

            // Check days per week limit
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            if (daysWorkedThisWeek >= p.daysPerWeek) return false;

            // For Saturday assignments, be more flexible with Saturday limits
            // Only filter out if they've exceeded their limit by more than 1
            if (isSaturday && p.assignedSaturdays > p.saturdaysPerMonth) return false;

            return true;
        });

        if (availableProviders.length === 0) return null;

        // Score providers based on preferences and fairness
        const scoredProviders = availableProviders.map(p => {
            let score = 0;

            // Calculate days per week progress
            const daysWorkedThisWeek = this.getDaysWorkedThisWeek(p, dayData.date);
            const daysNeededThisWeek = p.daysPerWeek;
            const daysRemainingThisWeek = daysNeededThisWeek - daysWorkedThisWeek;
            
            // Prefer providers who need more days to reach their weekly target (but don't override preferences)
            if (daysRemainingThisWeek > 0) {
                score += daysRemainingThisWeek * 10; // Moderate priority for providers who need days
            } else {
                // If they've reached their weekly limit, they shouldn't be available anyway
                score += -100; // Penalty for providers at their limit
            }

            // Prefer providers who haven't worked as much overall (secondary factor)
            score += (10 - p.assignedDays) * 5;

            // Prefer shift preference match (check in order of preference)
            const shiftPreferenceIndex = p.shiftPreferences.indexOf(shiftType);
            if (shiftPreferenceIndex !== -1) {
                // Higher score for earlier preferences (lower index)
                // 1st preference gets highest score, 2nd gets medium, 3rd gets very low (last resort)
                if (shiftPreferenceIndex === 0) {
                    score += 200; // Highest priority for 1st preference
                } else if (shiftPreferenceIndex === 1) {
                    score += 100; // Medium priority for 2nd preference
                } else if (shiftPreferenceIndex === 2) {
                    score += 10; // Very low priority for 3rd preference (absolute last resort)
                } else {
                    score += 1; // Minimal score for any other preferences
                }
            } else if (p.shiftPreferences.length === 0) {
                // Person has no preferences (empty shift preferences column) - they don't care
                // Give them a moderate score, but lower than people with explicit preferences
                score += 25;
            } else {
                // Person has preferences but this shift type isn't in them
                // This is worse than having no preferences at all
                score += Math.random() * 5;
            }

            // Saturday assignment priority logic:
            // 1. Providers with 2+ Saturdays WANT to work Saturdays - highest priority
            // 2. Providers with 1 Saturday don't WANT to work Saturdays but can be assigned if needed
            if (isSaturday) {
                const saturdaysNeeded = p.saturdaysPerMonth - p.assignedSaturdays;
                
                if (p.saturdaysPerMonth >= 2) {
                    // Providers who WANT to work Saturdays (2+ requested)
                    if (saturdaysNeeded > 0) {
                        score += saturdaysNeeded * 200; // Very high priority for providers who WANT Saturday shifts
                    } else {
                        score += -100; // Penalty for providers who have reached their desired Saturday limit
                    }
                } else if (p.saturdaysPerMonth === 1) {
                    // Providers who don't WANT to work Saturdays but can be assigned if needed
                    if (saturdaysNeeded > 0) {
                        score += 50; // Lower priority for providers who don't want Saturday shifts
                    } else {
                        score += -200; // Strong penalty for providers who don't want Saturday shifts and have been assigned
                    }
                }
            }

            // Random factor to break ties
            score += Math.random() * 10;

            return { provider: p, score };
        });

        // Sort by score and return the best provider
        scoredProviders.sort((a, b) => b.score - a.score);
        return scoredProviders[0].provider;
    }


    generatePreferencesTable() {
        if (!this.providers || this.providers.length === 0) {
            return '<div class="preferences-table"><h3>Provider Preferences</h3><p>No provider data available</p></div>';
        }

        let html = '<div class="preferences-table">';
        html += '<h3>Provider Preferences Verification</h3>';
        html += '<p>Please verify that your input data was parsed correctly:</p>';
        html += '<table class="preferences"><thead><tr>';
        html += '<th>Name</th><th>Days/Week</th><th>Saturdays/Month</th><th>Preferred Days Off</th><th>Shift Preferences</th><th>PTO Dates</th>';
        html += '</tr></thead><tbody>';

        this.providers.forEach(provider => {
            html += '<tr>';
            html += `<td class="provider-name">${provider.name}</td>`;
            html += `<td>${provider.daysPerWeek}</td>`;
            html += `<td>${provider.saturdaysPerMonth}</td>`;
            
            // Format preferred days off
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const preferredDaysOff = provider.preferredDaysOff.map(dayNum => dayNames[dayNum]).join(', ');
            html += `<td>${preferredDaysOff || 'None'}</td>`;
            
            // Format shift preferences
            const shiftPrefs = provider.shiftPreferences.join(', ');
            html += `<td>${shiftPrefs}</td>`;
            
            // Format PTO dates
            const ptoDates = provider.ptoDates.map(date => {
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const year = date.getFullYear();
                return `${month}/${day}/${year}`;
            }).join(', ');
            html += `<td>${ptoDates || 'None'}</td>`;
            
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';
        
        return html;
    }

    displaySchedule() {
        const container = document.getElementById('calendar-container');
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;

        let html = this.generatePreferencesTable();
        html += '<div class="schedule-separator"></div>';
        
        // Add issue analysis dashboard
        html += this.generateIssueAnalysisDashboard();
        html += '<div class="schedule-separator"></div>';

        // Display schedule for each location
        for (const location in this.schedule) {
            html += `<div class="location-schedule">`;
            html += `<h3 class="location-header">${location} Location</h3>`;
            html += '<table class="calendar"><thead><tr>';
            html += '<th>Date</th><th>Day</th><th>Open</th><th>Mid</th><th>Close</th><th>PTO Today</th><th>Issues</th></tr></thead><tbody>';

            for (const day in this.schedule[location]) {
                const dayData = this.schedule[location][day];
                const dayNum = parseInt(day);
                const date = new Date(year, month, dayNum);
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                
                html += '<tr>';
                html += `<td>${dayNum}</td>`;
                html += `<td class="${dayData.isWeekend ? 'weekend' : ''} ${dayData.isHoliday ? 'holiday' : ''}">${dayNames[dayData.dayOfWeek]}</td>`;
                
                // Display shifts
                if (dayData.isHoliday) {
                    // Holiday: show holiday name centered across all three shift columns
                    html += '<td colspan="3" class="holiday-shift-cell">';
                    html += `<span class="holiday-name">${dayData.holidayName}</span>`;
                    html += '</td>';
                } else {
                    const isSaturday = dayData.dayOfWeek === 6;
                    const isThursday = dayData.dayOfWeek === 4;
                    
                    if (isThursday) {
                        // Thursday: only show mid shift, hide open and close
                        html += '<td class="thursday-off">-</td>'; // Open column
                        const midProviders = dayData.shifts.mid || [];
                        html += `<td class="shift-cell thursday-mid" data-day="${dayNum}" data-shift="mid" data-location="${location}">`;
                        if (midProviders.length > 0) {
                            midProviders.forEach((provider, index) => {
                                const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                                    ptoDate.getDate() === dayNum && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                                );
                                if (index > 0) html += '<br>'; // Add line break for multiple providers
                                html += `<span class="shift mid ${isPTO ? 'pto' : ''}" data-provider="${provider}">${provider}</span>`;
                            });
                        } else {
                            html += '<span class="shift off">OFF</span>';
                        }
                        html += '</td>';
                        html += '<td class="thursday-off">-</td>'; // Close column
                    } else if (isSaturday) {
                        // Saturday: only show mid shift, hide open and close
                        html += '<td class="saturday-off">-</td>'; // Open column
                        const midProviders = dayData.shifts.mid || [];
                        html += `<td class="shift-cell" data-day="${dayNum}" data-shift="mid" data-location="${location}">`;
                        if (midProviders.length > 0) {
                            midProviders.forEach(provider => {
                                const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                                    ptoDate.getDate() === dayNum && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                                );
                                html += `<span class="shift mid ${isPTO ? 'pto' : ''}" data-provider="${provider}">${provider}</span>`;
                            });
                        } else {
                            html += '<span class="shift off">OFF</span>';
                        }
                        html += '</td>';
                        html += '<td class="saturday-off">-</td>'; // Close column
                    } else {
                        // Other weekdays: show all shifts
                        ['open', 'mid', 'close'].forEach(shiftType => {
                            const providers = dayData.shifts[shiftType] || [];
                            html += `<td class="shift-cell" data-day="${dayNum}" data-shift="${shiftType}" data-location="${location}">`;
                            if (providers.length > 0) {
                                providers.forEach(provider => {
                                    const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                                        ptoDate.getDate() === dayNum && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                                    );
                                    html += `<span class="shift ${shiftType} ${isPTO ? 'pto' : ''}" data-provider="${provider}">${provider}</span>`;
                                });
                            } else {
                                html += '<span class="shift off">OFF</span>';
                            }
                            html += '</td>';
                        });
                    }
                }
                
                // Display PTO Today column
                html += '<td class="pto-column">';
                const ptoToday = this.providers.filter(provider => 
                    provider.location === location && provider.ptoDates.some(ptoDate => {
                        const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                        const scheduleDateNormalized = new Date(year, month, dayNum);
                        return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                    })
                );
                
                if (ptoToday.length > 0) {
                    ptoToday.forEach((provider, index) => {
                        if (index > 0) html += ', ';
                        html += `<span class="pto-name">${provider.name}</span>`;
                    });
                } else {
                    html += '<span class="no-pto">-</span>';
                }
                html += '</td>';
                
                // Add Issues column
                html += '<td class="issues-column">';
                const dayIssues = this.analyzeDayIssues(dayData, dayNum, month, year, location);
                if (dayIssues.length > 0) {
                    dayIssues.forEach(issue => {
                        html += `<div class="issue-alert ${issue.severity}">${issue.message}</div>`;
                    });
                } else {
                    html += '<span class="no-issues">✓</span>';
                }
                html += '</td>';
                
                html += '</tr>';
            }
            
            html += '</tbody></table>';
            html += '</div>';
        }

        container.innerHTML = html;

        // Add interactive features
        this.addInteractiveFeatures();

        document.getElementById('schedule-results').classList.remove('hidden');
    }

    addInteractiveFeatures() {
        // Add click handlers for issue items to highlight related calendar entries
        document.querySelectorAll('.issue-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const issueText = e.currentTarget.querySelector('.issue-text').textContent;
                this.highlightRelatedEntries(issueText);
                this.scrollToIssue(issueText);
            });
        });

        // Add hover effects for metric cards
        document.querySelectorAll('.metric-card').forEach(card => {
            card.addEventListener('mouseenter', (e) => {
                this.showMetricDetails(e.currentTarget);
            });
        });

        // Add click handlers for provider workload rows
        document.querySelectorAll('.workload-table tbody tr').forEach(row => {
            row.addEventListener('click', (e) => {
                const providerName = e.currentTarget.querySelector('td:first-child').textContent;
                this.highlightProviderSchedule(providerName);
            });
        });

        // Add issue filtering buttons
        this.addIssueFilteringButtons();
        
        // Add shift editing functionality
        this.addShiftEditingHandlers();
    }

    highlightRelatedEntries(issueText) {
        // Remove previous highlights
        document.querySelectorAll('.highlighted-cell').forEach(el => {
            el.classList.remove('highlighted-cell');
        });

        // Highlight related calendar entries based on issue text
        if (issueText.includes('understaffed')) {
            document.querySelectorAll('.issue-alert.error').forEach(alert => {
                if (alert.textContent.includes('Understaffed')) {
                    const row = alert.closest('tr');
                    if (row) {
                        const cells = row.querySelectorAll('td');
                        cells.forEach(cell => {
                            cell.classList.add('highlighted-cell');
                        });
                    }
                }
            });
        } else if (issueText.includes('overworked')) {
            const providerName = issueText.split(' ')[0];
            document.querySelectorAll(`.shift`).forEach(shift => {
                if (shift.textContent.includes(providerName)) {
                    const row = shift.closest('tr');
                    if (row) {
                        const cells = row.querySelectorAll('td');
                        cells.forEach(cell => {
                            cell.classList.add('highlighted-cell');
                        });
                    }
                }
            });
        }
    }

    scrollToIssue(issueText) {
        // Extract day number and location from issue text
        const dayMatch = issueText.match(/Day (\d+)/);
        const locationMatch = issueText.match(/(\w+): Day/);
        
        if (dayMatch) {
            const dayNum = dayMatch[1];
            const location = locationMatch ? locationMatch[1] : 'Central'; // Default to Central if not specified
            
            // Find the specific day row in the schedule
            const locationSchedules = document.querySelectorAll('.location-schedule');
            let targetRow = null;
            
            for (const locationSchedule of locationSchedules) {
                const header = locationSchedule.querySelector('.location-header');
                if (header && header.textContent.includes(location)) {
                    // Find the row with the matching day number
                    const rows = locationSchedule.querySelectorAll('tbody tr');
                    for (const row of rows) {
                        const firstCell = row.querySelector('td:first-child');
                        if (firstCell && firstCell.textContent.trim() === dayNum) {
                            targetRow = row;
                            break;
                        }
                    }
                    break;
                }
            }
            
            if (targetRow) {
                // Scroll to the day row with smooth behavior
                targetRow.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Add a temporary highlight effect to individual cells instead of the whole row
                const cells = targetRow.querySelectorAll('td');
                cells.forEach(cell => {
                    cell.classList.add('highlighted-cell');
                });
                
                // Remove highlight after 3 seconds
                setTimeout(() => {
                    cells.forEach(cell => {
                        cell.classList.remove('highlighted-cell');
                    });
                }, 3000);
            }
        } else if (issueText.includes('overworked')) {
            // For overworked issues, scroll to the first occurrence of the provider
            const providerName = issueText.split(' ')[0];
            const allShifts = document.querySelectorAll('.shift');
            let firstShift = null;
            
            for (const shift of allShifts) {
                if (shift.textContent.includes(providerName)) {
                    firstShift = shift;
                    break;
                }
            }
            
            if (firstShift) {
                firstShift.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Highlight the row containing this shift
                const row = firstShift.closest('tr');
                if (row) {
                    const cells = row.querySelectorAll('td');
                    cells.forEach(cell => {
                        cell.classList.add('highlighted-cell');
                    });
                    setTimeout(() => {
                        cells.forEach(cell => {
                            cell.classList.remove('highlighted-cell');
                        });
                    }, 3000);
                }
            }
        } else if (issueText.includes('preferred day off') || issueText.includes('not preferred')) {
            // For preference violations, extract day and location
            const dayMatch = issueText.match(/Day (\d+)/);
            const locationMatch = issueText.match(/(\w+): Day/);
            
            if (dayMatch) {
                const dayNum = dayMatch[1];
                const location = locationMatch ? locationMatch[1] : 'Central';
                
                // Find the specific day row in the schedule
                const locationSchedules = document.querySelectorAll('.location-schedule');
                let targetRow = null;
                
                for (const locationSchedule of locationSchedules) {
                    const header = locationSchedule.querySelector('.location-header');
                    if (header && header.textContent.includes(location)) {
                        // Find the row with the matching day number
                        const rows = locationSchedule.querySelectorAll('tbody tr');
                        for (const row of rows) {
                            const firstCell = row.querySelector('td:first-child');
                            if (firstCell && firstCell.textContent.trim() === dayNum) {
                                targetRow = row;
                                break;
                            }
                        }
                        break;
                    }
                }
                
                if (targetRow) {
                    // Scroll to the day row with smooth behavior
                    targetRow.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                    
                    // Add a temporary highlight effect to individual cells instead of the whole row
                    const cells = targetRow.querySelectorAll('td');
                    cells.forEach(cell => {
                        cell.classList.add('highlighted-cell');
                    });
                    
                    // Remove highlight after 3 seconds
                    setTimeout(() => {
                        cells.forEach(cell => {
                            cell.classList.remove('highlighted-cell');
                        });
                    }, 3000);
                }
            }
        }
    }

    showMetricDetails(card) {
        const metricType = card.querySelector('.metric-label').textContent.toLowerCase();
        let details = '';
        
        switch(metricType) {
            case 'total issues':
                details = 'Total number of problems found in the schedule that need attention';
                break;
            case 'understaffed days':
                details = 'Days with insufficient staff coverage (critical for patient safety)';
                break;
            case 'overworked providers':
                details = 'Providers assigned more days than their target workload';
                break;
            case 'preference violations':
                details = 'Times when providers are assigned shifts they don\'t prefer';
                break;
        }
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'metric-tooltip';
        tooltip.textContent = details;
        card.appendChild(tooltip);
        
        // Remove tooltip after 3 seconds
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        }, 3000);
    }

    highlightProviderSchedule(providerName) {
        // Remove previous highlights
        document.querySelectorAll('.highlighted').forEach(el => {
            el.classList.remove('highlighted');
        });

        // Highlight all shifts for this provider
        document.querySelectorAll(`.shift`).forEach(shift => {
            if (shift.textContent.includes(providerName)) {
                shift.classList.add('highlighted');
                shift.closest('tr').classList.add('highlighted');
            }
        });
    }

    addIssueFilteringButtons() {
        const dashboard = document.querySelector('.issue-dashboard');
        if (!dashboard) return;

        const filterContainer = document.createElement('div');
        filterContainer.className = 'issue-filters';
        filterContainer.innerHTML = `
            <h4>🔍 Filter Issues</h4>
            <div class="filter-buttons">
                <button class="filter-btn active" data-filter="all">All Issues</button>
                <button class="filter-btn" data-filter="error">Critical</button>
                <button class="filter-btn" data-filter="warning">Warnings</button>
                <button class="filter-btn" data-filter="understaffing">Understaffing</button>
                <button class="filter-btn" data-filter="overworked">Overworked</button>
                <button class="filter-btn" data-filter="preference">Preferences</button>
            </div>
        `;

        dashboard.insertBefore(filterContainer, dashboard.querySelector('.issues-summary'));

        // Add click handlers for filter buttons
        filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterIssues(filter);
                
                // Update active button
                filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    }

    filterIssues(filter) {
        const issueItems = document.querySelectorAll('.issue-item');
        
        issueItems.forEach(item => {
            if (filter === 'all') {
                item.style.display = 'flex';
            } else if (filter === 'error') {
                item.style.display = item.classList.contains('error') ? 'flex' : 'none';
            } else if (filter === 'warning') {
                item.style.display = item.classList.contains('warning') ? 'flex' : 'none';
            } else {
                // Filter by issue type
                const issueText = item.querySelector('.issue-text').textContent.toLowerCase();
                const show = issueText.includes(filter);
                item.style.display = show ? 'flex' : 'none';
            }
        });
    }

    exportSchedule() {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

        // Create workbook with multiple sheets for each location
        const wb = XLSX.utils.book_new();

        for (const location in this.schedule) {
            // Create export data for this location
            const exportData = [];
            exportData.push(['Date', 'Day', 'Open', 'Mid', 'Close', 'PTO Today']);

            for (const day in this.schedule[location]) {
                const dayData = this.schedule[location][day];
                const dayNum = parseInt(day);
                const date = new Date(year, month, dayNum);
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                
                // Get PTO for this day for this location
                const ptoToday = this.providers.filter(provider => 
                    provider.location === location && provider.ptoDates.some(ptoDate => {
                        const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                        const scheduleDateNormalized = new Date(year, month, dayNum);
                        return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                    })
                ).map(provider => provider.name).join(', ');
                
                const isSaturday = dayData.dayOfWeek === 6;
                const isThursday = dayData.dayOfWeek === 4;
                
                let openShift, midShift, closeShift;
                
                if (dayData.isHoliday) {
                    // Holiday: show holiday name in all three shift columns
                    openShift = dayData.holidayName;
                    midShift = dayData.holidayName;
                    closeShift = dayData.holidayName;
                } else {
                    // Regular day: show actual shifts
                    openShift = (isSaturday || isThursday) ? '-' : (dayData.shifts.open || []).join(', ');
                    midShift = (dayData.shifts.mid || []).join(', ');
                    closeShift = (isSaturday || isThursday) ? '-' : (dayData.shifts.close || []).join(', ');
                }
                
                const row = [
                    `${monthName} ${dayNum}`,
                    dayNames[dayData.dayOfWeek],
                    openShift,
                    midShift,
                    closeShift,
                    ptoToday || '-'
                ];
                exportData.push(row);
            }

            // Create worksheet for this location
            const ws = XLSX.utils.aoa_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, `${location} Schedule`);
        }

        // Download the workbook
        XLSX.writeFile(wb, `CHC_Schedule_${monthName}_${year}.xlsx`);
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('schedule-results').classList.add('hidden');
        document.getElementById('error-message').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('error-text').textContent = message;
        document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('schedule-results').classList.add('hidden');
    }

    generateIssueAnalysisDashboard() {
        const analysis = this.performScheduleAnalysis();
        
        let html = '<div class="issue-dashboard">';
        html += '<h3>📊 Schedule Analysis Dashboard</h3>';
        
        // Summary metrics
        html += '<div class="metrics-grid">';
        html += `<div class="metric-card ${analysis.totalIssues === 0 ? 'success' : 'warning'}">`;
        html += `<div class="metric-number">${analysis.totalIssues}</div>`;
        html += '<div class="metric-label">Total Issues</div>';
        html += '</div>';
        
        html += `<div class="metric-card ${analysis.understaffedDays === 0 ? 'success' : 'error'}">`;
        html += `<div class="metric-number">${analysis.understaffedDays}</div>`;
        html += '<div class="metric-label">Understaffed Days</div>';
        html += '</div>';
        
        html += `<div class="metric-card ${analysis.overworkedProviders === 0 ? 'success' : 'warning'}">`;
        html += `<div class="metric-number">${analysis.overworkedProviders}</div>`;
        html += '<div class="metric-label">Overworked Providers</div>';
        html += '</div>';
        
        html += `<div class="metric-card ${analysis.preferenceViolations === 0 ? 'success' : 'warning'}">`;
        html += `<div class="metric-number">${analysis.preferenceViolations}</div>`;
        html += '<div class="metric-label">Preference Violations</div>';
        html += '</div>';
        html += '</div>';
        
        // Detailed issues
        if (analysis.issues.length > 0) {
            html += '<div class="issues-summary">';
            html += '<h4>🚨 Issues Requiring Attention</h4>';
            html += '<div class="issues-list">';
            
            analysis.issues.forEach(issue => {
                html += `<div class="issue-item ${issue.severity}">`;
                html += `<span class="issue-icon">${this.getIssueIcon(issue.type)}</span>`;
                html += `<span class="issue-text">${issue.message}</span>`;
                html += '</div>';
            });
            
            html += '</div>';
            html += '</div>';
        }
        
        // Provider workload analysis
        html += '<div class="workload-analysis">';
        html += '<h4>👥 Provider Workload Analysis</h4>';
        html += '<div class="workload-table">';
        html += '<table><thead><tr><th>Provider</th><th>Days Assigned</th><th>Target Days</th><th>Saturday Coverage</th><th>Workload Status</th></tr></thead><tbody>';
        
        analysis.providerWorkload.forEach(provider => {
            const statusClass = provider.status === 'balanced' ? 'success' : 
                              provider.status === 'overworked' ? 'error' : 'warning';
            html += `<tr class="${statusClass}">`;
            html += `<td>${provider.name}</td>`;
            html += `<td>${provider.assignedDays}</td>`;
            html += `<td>${provider.targetDays}</td>`;
            html += `<td>${provider.saturdayCoverage}</td>`;
            html += `<td><span class="status-badge ${statusClass}">${provider.status}</span></td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        html += '</div>';
        html += '</div>';
        
        html += '</div>';
        return html;
    }

    performScheduleAnalysis() {
        const analysis = {
            totalIssues: 0,
            understaffedDays: 0,
            overworkedProviders: 0,
            preferenceViolations: 0,
            issues: [],
            providerWorkload: []
        };
        
        // Analyze each location
        for (const location in this.schedule) {
            const locationAnalysis = this.analyzeLocationSchedule(location);
            analysis.totalIssues += locationAnalysis.issues.length;
            analysis.understaffedDays += locationAnalysis.understaffedDays;
            analysis.overworkedProviders += locationAnalysis.overworkedProviders;
            analysis.preferenceViolations += locationAnalysis.preferenceViolations;
            analysis.issues.push(...locationAnalysis.issues);
            analysis.providerWorkload.push(...locationAnalysis.providerWorkload);
        }
        
        return analysis;
    }

    analyzeLocationSchedule(location) {
        const analysis = {
            issues: [],
            understaffedDays: 0,
            overworkedProviders: 0,
            preferenceViolations: 0,
            providerWorkload: []
        };
        
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        
        // Get providers for this location
        const locationProviders = this.providers.filter(p => p.location === location);
        const floatProviders = this.providers.filter(p => p.location === 'Float');
        const allLocationProviders = [...locationProviders, ...floatProviders];
        
        // Track provider assignments
        const providerStats = {};
        allLocationProviders.forEach(provider => {
            providerStats[provider.name] = {
                assignedDays: 0,
                assignedSaturdays: 0,
                assignedHolidays: 0,
                preferenceViolations: 0,
                overworked: false
            };
        });
        
        // Analyze each day
        for (const day in this.schedule[location]) {
            const dayData = this.schedule[location][day];
            const dayNum = parseInt(day);
            const date = new Date(year, month, dayNum);
            
            // Check for understaffing
            const totalShifts = (dayData.shifts.open?.length || 0) + 
                               (dayData.shifts.mid?.length || 0) + 
                               (dayData.shifts.close?.length || 0);
            
            if (!dayData.isHoliday && dayData.dayOfWeek !== 0) { // Not Sunday
                // Only flag as understaffed if non-Saturday days have only 1 provider
                if (dayData.dayOfWeek !== 6 && totalShifts === 1) {
                    analysis.understaffedDays++;
                    analysis.issues.push({
                        type: 'understaffing',
                        severity: 'error',
                        message: `${location}: Day ${dayNum} understaffed (only 1 provider on weekday)`,
                        location: location,
                        day: dayNum
                    });
                }
            }
            
            // Track provider assignments
            ['open', 'mid', 'close'].forEach(shiftType => {
                const providers = dayData.shifts[shiftType] || [];
                providers.forEach(providerName => {
                    if (providerStats[providerName]) {
                        providerStats[providerName].assignedDays++;
                        if (dayData.dayOfWeek === 6) {
                            providerStats[providerName].assignedSaturdays++;
                        }
                        
                        // Check for preference violations
                        const provider = allLocationProviders.find(p => p.name === providerName);
                        if (provider) {
                            // Check if working on preferred day off
                            if (provider.preferredDaysOff.includes(dayData.dayOfWeek)) {
                                providerStats[providerName].preferenceViolations++;
                                analysis.preferenceViolations++;
                            }
                            
                            // Check if working shift they don't prefer
                            if (provider.shiftPreferences.length > 0 && 
                                !provider.shiftPreferences.includes(shiftType)) {
                                providerStats[providerName].preferenceViolations++;
                                analysis.preferenceViolations++;
                            }
                        }
                    }
                });
            });
        }
        
        // Analyze provider workload
        allLocationProviders.forEach(provider => {
            const stats = providerStats[provider.name];
            const targetDays = provider.daysPerWeek * 4; // Approximate monthly target
            const saturdayTarget = provider.saturdaysPerMonth;
            
            let status = 'balanced';
            if (stats.assignedDays > targetDays + 2) {
                status = 'overworked';
                analysis.overworkedProviders++;
            } else if (stats.assignedDays < targetDays - 2) {
                status = 'underworked';
            }
            
            analysis.providerWorkload.push({
                name: provider.name,
                assignedDays: stats.assignedDays,
                targetDays: targetDays,
                saturdayCoverage: `${stats.assignedSaturdays}/${saturdayTarget}`,
                status: status,
                preferenceViolations: stats.preferenceViolations
            });
            
            // Add workload issues
            if (status === 'overworked') {
                analysis.issues.push({
                    type: 'overworked',
                    severity: 'warning',
                    message: `${provider.name} is overworked (${stats.assignedDays} days vs ${targetDays} target)`,
                    provider: provider.name
                });
            }
            
            // Track individual preference violations with dates
            if (stats.preferenceViolations > 0) {
                // Find the specific dates where preference violations occurred
                const violationDates = this.findPreferenceViolationDates(provider, location, year, month);
                violationDates.forEach(violation => {
                    analysis.issues.push({
                        type: 'preference',
                        severity: 'warning',
                        message: `${location}: Day ${violation.day} - ${provider.name} ${violation.violationType}`,
                        provider: provider.name,
                        day: violation.day,
                        location: location
                    });
                });
            }
        });
        
        return analysis;
    }

    analyzeDayIssues(dayData, dayNum, month, year, location) {
        const issues = [];
        
        // Check for understaffing
        const totalShifts = (dayData.shifts.open?.length || 0) + 
                           (dayData.shifts.mid?.length || 0) + 
                           (dayData.shifts.close?.length || 0);
        
        if (!dayData.isHoliday && dayData.dayOfWeek !== 0) {
            // Only flag as understaffed if non-Saturday days have only 1 provider
            if (dayData.dayOfWeek !== 6 && totalShifts === 1) {
                issues.push({
                    severity: 'error',
                    message: `Understaffed (only 1 provider)`
                });
            }
        }
        
        // Check for PTO conflicts
        const assignedProviders = [
            ...(dayData.shifts.open || []),
            ...(dayData.shifts.mid || []),
            ...(dayData.shifts.close || [])
        ];
        
        assignedProviders.forEach(providerName => {
            const provider = this.providers.find(p => p.name === providerName);
            if (provider && provider.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(year, month, dayNum);
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            })) {
                issues.push({
                    severity: 'error',
                    message: `${providerName} on PTO`
                });
            }
        });
        
        return issues;
    }

    findPreferenceViolationDates(provider, location, year, month) {
        const violations = [];
        
        // Check each day in the schedule for this location
        if (this.schedule[location]) {
            for (const day in this.schedule[location]) {
                const dayData = this.schedule[location][day];
                const dayNum = parseInt(day);
                const date = new Date(year, month, dayNum);
                
                // Check if this provider is assigned on this day
                const assignedShifts = [];
                ['open', 'mid', 'close'].forEach(shiftType => {
                    const providers = dayData.shifts[shiftType] || [];
                    if (providers.includes(provider.name)) {
                        assignedShifts.push(shiftType);
                    }
                });
                
                if (assignedShifts.length > 0) {
                    // Check for preferred day off violation
                    if (provider.preferredDaysOff.includes(dayData.dayOfWeek)) {
                        violations.push({
                            day: dayNum,
                            violationType: `working on preferred day off (${this.getDayName(dayData.dayOfWeek)})`
                        });
                    }
                    
                    // Check for shift preference violations
                    assignedShifts.forEach(shiftType => {
                        if (provider.shiftPreferences.length > 0 && 
                            !provider.shiftPreferences.includes(shiftType)) {
                            violations.push({
                                day: dayNum,
                                violationType: `assigned ${shiftType} shift (not preferred)`
                            });
                        }
                    });
                }
            }
        }
        
        return violations;
    }

    getDayName(dayOfWeek) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return dayNames[dayOfWeek];
    }

    getIssueIcon(issueType) {
        const icons = {
            'understaffing': '⚠️',
            'overworked': '😰',
            'preference': '😕',
            'pto': '🏖️',
            'saturday': '📅'
        };
        return icons[issueType] || '⚠️';
    }

    addShiftEditingHandlers() {
        // Add click handlers to all shift cells
        document.querySelectorAll('.shift-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startShiftEdit(cell);
            });
        });
        
        // Add drag & drop functionality
        this.addDragAndDropHandlers();
    }

    startShiftEdit(cell) {
        // Don't edit if already in edit mode
        if (cell.querySelector('.shift-edit-dropdown')) return;

        const day = parseInt(cell.dataset.day);
        const shiftType = cell.dataset.shift;
        const location = cell.dataset.location;
        
        // Get current providers for this shift
        const currentProviders = this.schedule[location][day].shifts[shiftType] || [];
        
        // Create dropdown for provider selection
        const dropdown = document.createElement('select');
        dropdown.className = 'shift-edit-dropdown';
        dropdown.multiple = true;
        dropdown.size = Math.min(5, this.providers.length + 1);
        
        // Add "OFF" option
        const offOption = document.createElement('option');
        offOption.value = '';
        offOption.textContent = 'OFF';
        offOption.selected = currentProviders.length === 0;
        dropdown.appendChild(offOption);
        
        // Add provider options
        const availableProviders = this.getAvailableProviders(day, shiftType, location);
        availableProviders.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.name;
            option.textContent = provider.name;
            option.selected = currentProviders.includes(provider.name);
            dropdown.appendChild(option);
        });
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'shift-edit-buttons';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'btn-save-shift';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveShiftEdit(cell, dropdown);
        });
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn-cancel-shift';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancelShiftEdit(cell);
        });
        
        buttonContainer.appendChild(saveBtn);
        buttonContainer.appendChild(cancelBtn);
        
        // Hide current content and show edit interface
        cell.style.position = 'relative';
        cell.querySelectorAll('.shift').forEach(shift => shift.style.display = 'none');
        
        const editContainer = document.createElement('div');
        editContainer.className = 'shift-edit-container';
        editContainer.appendChild(dropdown);
        editContainer.appendChild(buttonContainer);
        
        cell.appendChild(editContainer);
    }

    getAvailableProviders(day, shiftType, location) {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        const date = new Date(year, month, day);
        
        // Get providers for this location (including float providers)
        const locationProviders = this.providers.filter(p => p.location === location);
        const floatProviders = this.providers.filter(p => p.location === 'Float');
        const allProviders = [...locationProviders, ...floatProviders];
        
        // Filter out providers who are on PTO or already assigned to another shift that day
        return allProviders.filter(provider => {
            // Check if provider is on PTO
            const isOnPTO = provider.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(year, month, day);
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            
            if (isOnPTO) return false;
            
            // Check if provider is already assigned to another shift that day
            const dayData = this.schedule[location][day];
            const alreadyAssigned = Object.values(dayData.shifts).some(shifts => 
                Array.isArray(shifts) && shifts.includes(provider.name)
            );
            
            return !alreadyAssigned;
        });
    }

    saveShiftEdit(cell, dropdown) {
        const day = parseInt(cell.dataset.day);
        const shiftType = cell.dataset.shift;
        const location = cell.dataset.location;
        
        // Get selected providers
        const selectedProviders = Array.from(dropdown.selectedOptions)
            .map(option => option.value)
            .filter(value => value !== ''); // Remove empty "OFF" selection
        
        // Validate the selection
        if (!this.validateShiftChange(day, shiftType, location, selectedProviders)) {
            return;
        }
        
        // Update the schedule data
        this.schedule[location][day].shifts[shiftType] = selectedProviders;
        
        // Update the display
        this.updateShiftCellDisplay(cell, selectedProviders, shiftType, day);
        
        // Remove edit interface
        cell.querySelector('.shift-edit-container').remove();
        
        // Show updated shifts
        cell.querySelectorAll('.shift').forEach(shift => shift.style.display = '');
        
        // Update dashboard
        this.updateDashboard();
    }

    validateShiftChange(day, shiftType, location, selectedProviders) {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        
        // Check for PTO conflicts
        for (const providerName of selectedProviders) {
            const provider = this.providers.find(p => p.name === providerName);
            if (provider) {
                const isOnPTO = provider.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(year, month, day);
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                });
                
                if (isOnPTO) {
                    alert(`Cannot assign ${providerName} to ${shiftType} shift on day ${day} - they are on PTO.`);
                    return false;
                }
            }
        }
        
        // Check for double-booking (provider assigned to multiple shifts same day)
        const dayData = this.schedule[location][day];
        for (const providerName of selectedProviders) {
            for (const [otherShiftType, otherProviders] of Object.entries(dayData.shifts)) {
                if (otherShiftType !== shiftType && Array.isArray(otherProviders) && otherProviders.includes(providerName)) {
                    alert(`Cannot assign ${providerName} to ${shiftType} shift - they are already assigned to ${otherShiftType} shift.`);
                    return false;
                }
            }
        }
        
        return true;
    }

    updateShiftCellDisplay(cell, selectedProviders, shiftType, day) {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        
        // Clear existing shift spans
        cell.querySelectorAll('.shift').forEach(shift => shift.remove());
        
        if (selectedProviders.length > 0) {
            selectedProviders.forEach((provider, index) => {
                const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                    ptoDate.getDate() === day && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                );
                
                const shiftSpan = document.createElement('span');
                shiftSpan.className = `shift ${shiftType} ${isPTO ? 'pto' : ''}`;
                shiftSpan.setAttribute('data-provider', provider);
                shiftSpan.textContent = provider;
                
                if (index > 0) {
                    shiftSpan.style.display = 'block';
                    shiftSpan.style.marginTop = '2px';
                }
                
                cell.appendChild(shiftSpan);
            });
        } else {
            const offSpan = document.createElement('span');
            offSpan.className = 'shift off';
            offSpan.textContent = 'OFF';
            cell.appendChild(offSpan);
        }
    }

    cancelShiftEdit(cell) {
        // Remove edit interface
        cell.querySelector('.shift-edit-container').remove();
        
        // Show original shifts
        cell.querySelectorAll('.shift').forEach(shift => shift.style.display = '');
    }

    updateDashboard() {
        // Re-generate and update the issue analysis dashboard
        const dashboard = document.querySelector('.issue-dashboard');
        if (dashboard) {
            const newDashboard = this.generateIssueAnalysisDashboard();
            dashboard.outerHTML = newDashboard;
            
            // Re-add interactive features to the new dashboard
            this.addInteractiveFeatures();
        }
        
        // Re-add drag and drop handlers after any updates
        this.addDragAndDropHandlers();
    }

    addDragAndDropHandlers() {
        // Remove existing handlers first to prevent duplicates
        this.removeDragAndDropHandlers();
        
        // Add drag handlers to all shift spans
        document.querySelectorAll('.shift').forEach(shift => {
            if (!shift.classList.contains('off') && !shift.hasAttribute('data-drag-handler')) {
                shift.draggable = true;
                shift.setAttribute('data-drag-handler', 'true');
                shift.addEventListener('dragstart', (e) => this.handleDragStart(e));
                shift.addEventListener('dragend', (e) => this.handleDragEnd(e));
            }
        });

        // Add drop handlers to all shift cells
        document.querySelectorAll('.shift-cell').forEach(cell => {
            if (!cell.hasAttribute('data-drop-handler')) {
                cell.setAttribute('data-drop-handler', 'true');
                cell.addEventListener('dragover', (e) => this.handleDragOver(e));
                cell.addEventListener('drop', (e) => this.handleDrop(e));
                cell.addEventListener('dragenter', (e) => this.handleDragEnter(e));
                cell.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            }
        });
    }

    removeDragAndDropHandlers() {
        // Remove drag handlers
        document.querySelectorAll('.shift[data-drag-handler]').forEach(shift => {
            shift.removeAttribute('data-drag-handler');
            shift.draggable = false;
        });

        // Remove drop handlers
        document.querySelectorAll('.shift-cell[data-drop-handler]').forEach(cell => {
            cell.removeAttribute('data-drop-handler');
        });
    }

    handleDragStart(e) {
        const shift = e.target;
        const provider = shift.getAttribute('data-provider');
        const day = shift.closest('.shift-cell').dataset.day;
        const shiftType = shift.closest('.shift-cell').dataset.shift;
        const location = shift.closest('.shift-cell').dataset.location;
        
        // Store drag data
        e.dataTransfer.setData('text/plain', JSON.stringify({
            provider: provider,
            sourceDay: day,
            sourceShift: shiftType,
            sourceLocation: location,
            sourceElement: shift.outerHTML
        }));
        
        // Set drag image
        const dragImage = shift.cloneNode(true);
        dragImage.style.opacity = '0.8';
        dragImage.style.transform = 'rotate(5deg)';
        dragImage.style.border = '2px solid #2196f3';
        dragImage.style.borderRadius = '4px';
        dragImage.style.padding = '4px';
        dragImage.style.background = 'white';
        dragImage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        
        // Remove drag image after a short delay
        setTimeout(() => {
            if (document.body.contains(dragImage)) {
                document.body.removeChild(dragImage);
            }
        }, 0);
        
        // Add visual feedback
        shift.classList.add('dragging');
    }

    handleDragEnd(e) {
        // Remove visual feedback
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        const cell = e.currentTarget;
        if (!cell.classList.contains('drag-over')) {
            cell.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const cell = e.currentTarget;
        // Only remove drag-over if we're actually leaving the cell
        if (!cell.contains(e.relatedTarget)) {
            cell.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const targetCell = e.currentTarget;
        targetCell.classList.remove('drag-over');
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const sourceDay = parseInt(dragData.sourceDay);
            const sourceShift = dragData.sourceShift;
            const sourceLocation = dragData.sourceLocation;
            const provider = dragData.provider;
            
            const targetDay = parseInt(targetCell.dataset.day);
            const targetShift = targetCell.dataset.shift;
            const targetLocation = targetCell.dataset.location;
            
            // Check if we're dropping on the same shift
            if (sourceDay === targetDay && sourceShift === targetShift && sourceLocation === targetLocation) {
                return; // No change needed
            }
            
            // Check if we're dropping on another provider (swap)
            const targetShiftElement = targetCell.querySelector('.shift:not(.off)');
            if (targetShiftElement && targetShiftElement.getAttribute('data-provider')) {
                this.swapProviders(dragData, targetShiftElement, targetCell);
            } else {
                // Move provider to new shift
                this.moveProvider(dragData, targetCell);
            }
            
        } catch (error) {
            console.error('Error handling drop:', error);
        }
    }

    swapProviders(dragData, targetShiftElement, targetCell) {
        const sourceProvider = dragData.provider;
        const targetProvider = targetShiftElement.getAttribute('data-provider');
        
        const sourceDay = parseInt(dragData.sourceDay);
        const sourceShift = dragData.sourceShift;
        const sourceLocation = dragData.sourceLocation;
        
        const targetDay = parseInt(targetCell.dataset.day);
        const targetShift = targetCell.dataset.shift;
        const targetLocation = targetCell.dataset.location;
        
        // Validate both moves
        if (!this.validateProviderMove(sourceProvider, targetDay, targetShift, targetLocation, sourceShift) ||
            !this.validateProviderMove(targetProvider, sourceDay, sourceShift, sourceLocation, targetShift)) {
            return;
        }
        
        // Perform the swap
        this.performProviderSwap(
            sourceProvider, sourceDay, sourceShift, sourceLocation,
            targetProvider, targetDay, targetShift, targetLocation
        );
        
        // Update dashboard
        this.updateDashboard();
    }

    moveProvider(dragData, targetCell) {
        const provider = dragData.provider;
        const targetDay = parseInt(targetCell.dataset.day);
        const targetShift = targetCell.dataset.shift;
        const targetLocation = targetCell.dataset.location;
        const sourceDay = parseInt(dragData.sourceDay);
        const sourceShift = dragData.sourceShift;
        const sourceLocation = dragData.sourceLocation;
        
        // Validate the move
        if (!this.validateProviderMove(provider, targetDay, targetShift, targetLocation, sourceShift)) {
            return;
        }
        
        console.log(`Moving ${provider} from ${sourceLocation} day ${sourceDay} ${sourceShift} to ${targetLocation} day ${targetDay} ${targetShift}`);
        
        // Add to target (this will automatically remove from all other shifts on the same day)
        this.addProviderToShift(targetDay, targetShift, targetLocation, provider);
        
        // Update displays for both source and target
        const sourceCell = document.querySelector(`[data-day="${sourceDay}"][data-shift="${sourceShift}"][data-location="${sourceLocation}"]`);
        if (sourceCell) {
            this.updateShiftCellDisplay(
                sourceCell,
                this.schedule[sourceLocation][sourceDay].shifts[sourceShift],
                sourceShift,
                sourceDay
            );
        }
        
        this.updateShiftCellDisplay(targetCell, this.schedule[targetLocation][targetDay].shifts[targetShift], targetShift, targetDay);
        
        // Update dashboard
        this.updateDashboard();
    }

    validateProviderMove(provider, day, shiftType, location, sourceShiftType = null) {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        
        console.log(`Validating move: ${provider} to ${shiftType} shift on day ${day} (source: ${sourceShiftType})`);
        
        // Check if provider is on PTO
        const providerObj = this.providers.find(p => p.name === provider);
        if (providerObj) {
            const isOnPTO = providerObj.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(year, month, day);
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            
            if (isOnPTO) {
                alert(`Cannot move ${provider} to ${shiftType} shift on day ${day} - they are on PTO.`);
                return false;
            }
        }
        
        // Check if provider is already assigned to another shift that day
        const dayData = this.schedule[location][day];
        console.log(`Day data for ${day}:`, dayData);
        
        // Count how many shifts the provider is currently assigned to on this day
        let assignedShifts = 0;
        let currentShiftTypes = [];
        
        for (const [otherShiftType, otherProviders] of Object.entries(dayData.shifts)) {
            if (Array.isArray(otherProviders) && otherProviders.includes(provider)) {
                assignedShifts++;
                currentShiftTypes.push(otherShiftType);
                console.log(`Provider ${provider} found in ${otherShiftType} shift`);
            }
        }
        
        // If provider is in more than one shift, that's a problem
        if (assignedShifts > 1) {
            console.log(`Provider ${provider} is in multiple shifts: ${currentShiftTypes.join(', ')}`);
            alert(`Cannot move ${provider} - they are currently assigned to multiple shifts: ${currentShiftTypes.join(', ')}`);
            return false;
        }
        
        // If provider is in exactly one shift and it's not the target shift, check if it's the source
        if (assignedShifts === 1) {
            const currentShift = currentShiftTypes[0];
            if (currentShift === shiftType) {
                console.log(`Provider already in target shift, allowing`);
                return true;
            }
            if (sourceShiftType && currentShift === sourceShiftType) {
                console.log(`Provider in source shift, allowing move`);
                return true;
            }
            console.log(`Blocking move - provider in ${currentShift} shift`);
            alert(`Cannot move ${provider} to ${shiftType} shift - they are already assigned to ${currentShift} shift.`);
            return false;
        }
        
        console.log(`Validation passed for ${provider}`);
        return true;
    }

    performProviderSwap(sourceProvider, sourceDay, sourceShift, sourceLocation, targetProvider, targetDay, targetShift, targetLocation) {
        // Remove both providers from their current shifts
        this.removeProviderFromShift(sourceDay, sourceShift, sourceLocation, sourceProvider);
        this.removeProviderFromShift(targetDay, targetShift, targetLocation, targetProvider);
        
        // Add them to each other's shifts
        this.addProviderToShift(targetDay, targetShift, targetLocation, sourceProvider);
        this.addProviderToShift(sourceDay, sourceShift, sourceLocation, targetProvider);
        
        // Update displays
        const sourceCell = document.querySelector(`[data-day="${sourceDay}"][data-shift="${sourceShift}"][data-location="${sourceLocation}"]`);
        const targetCell = document.querySelector(`[data-day="${targetDay}"][data-shift="${targetShift}"][data-location="${targetLocation}"]`);
        
        this.updateShiftCellDisplay(sourceCell, this.schedule[sourceLocation][sourceDay].shifts[sourceShift], sourceShift, sourceDay);
        this.updateShiftCellDisplay(targetCell, this.schedule[targetLocation][targetDay].shifts[targetShift], targetShift, targetDay);
    }

    removeProviderFromShift(day, shiftType, location, provider) {
        const shifts = this.schedule[location][day].shifts[shiftType];
        if (Array.isArray(shifts)) {
            const index = shifts.indexOf(provider);
            if (index > -1) {
                shifts.splice(index, 1);
                console.log(`Removed ${provider} from ${location} day ${day} ${shiftType}. Remaining:`, shifts);
            } else {
                console.log(`Provider ${provider} not found in ${location} day ${day} ${shiftType}`);
            }
        } else {
            console.log(`No shifts array found for ${location} day ${day} ${shiftType}`);
        }
    }

    addProviderToShift(day, shiftType, location, provider) {
        if (!this.schedule[location][day].shifts[shiftType]) {
            this.schedule[location][day].shifts[shiftType] = [];
        }
        
        // Remove provider from all other shifts on the same day first
        this.removeProviderFromAllShiftsOnDay(day, location, provider);
        
        // Then add to the target shift
        this.schedule[location][day].shifts[shiftType].push(provider);
        console.log(`Added ${provider} to ${location} day ${day} ${shiftType}. Now has:`, this.schedule[location][day].shifts[shiftType]);
    }

    removeProviderFromAllShiftsOnDay(day, location, provider) {
        const dayData = this.schedule[location][day];
        for (const [shiftType, providers] of Object.entries(dayData.shifts)) {
            if (Array.isArray(providers)) {
                const index = providers.indexOf(provider);
                if (index > -1) {
                    providers.splice(index, 1);
                    console.log(`Removed ${provider} from ${location} day ${day} ${shiftType}`);
                }
            }
        }
    }
}

// Initialize the scheduler when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CHCScheduler();
});

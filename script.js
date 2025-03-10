// Initialize the map and set its view to your chosen geographical coordinates and zoom level
const map = L.map('map').setView([50.2494, -4.9356], 10); // Adjust center and zoom


// Add a tile layer (e.g., OpenStreetMap tiles)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
let allMarkers = [];
let allAgeGroups = new Set(); // Store all unique age groups
let allGenderGroups = new Set(); // Store all unique age groups
let allDGroups = new Set(); 
let allGenderAgeGroups = new Set(); // Store all unique age groups
let selectedStarLevels = []; // Store selected star levels
let selectedAgeGroups = []; // Store selected age groups
let selectedGender = []; // Store selected age groups
let selectedD = []; // Store selected age groups
let selectedGenderAge = []; // Store selected age groups
let geojsonLayer;
let combinations;
let amount;
let percentofpop;
let meanTeamsPer50;
let stdDevTeamsPer50;
let teamsCSVText = "";
let clubCSVText = "";
function handleTeamsUpload(event) {
    const file = event.target.files[0];
    if (file) {
        readXLSXFile(file, async data => {
            console.log(data)
            teamsCsvData = await preprocess(data); // Preprocess before storing

            if (clubsCsvData) processCSVData();
        });
    }
}

// Function to handle XLSX file upload for clubs
function handleClubsUpload(event) {
    const file = event.target.files[0];
    if (file) {
        readXLSXFile(file, data => {
            clubsCsvData = data;
            if (teamsCsvData) processCSVData();
        });
    }
}

function readXLSXFile(file, callback) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        // Assume data is in the first sheet
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });  // 1 means first row is header

        // Set the first row as column headers and remove the first row from the data
        const headers = sheetData[2];
        const rows = sheetData.slice(3);  // Get the remaining rows

        // Prepare the data and pass it back to the callback
        callback([headers, ...rows]);
    };
    reader.readAsBinaryString(file);
}

async function preprocess(csvData) {
    if (!csvData || csvData.length === 0) return csvData;

    const headers = csvData[0];
    const postcodeIndex = headers.indexOf('Postcode');

    if (postcodeIndex === -1) {
        console.error("Missing 'Postcode' column in CSV.");
        return csvData;
    }

    // Add new headers for Longitude, Latitude, and PAR23CD
    headers.push('Longitude', 'Latitude', 'PAR23CD');

    // Load the postcodes.csv file
    const postcodeCSV = await fetch('postcodes.csv')
        .then(response => response.text())
        .then(text => {
            const rows = text.split('\n').map(row => row.split(','));
            const postcodeHeader = rows[0];
            const postcodeData = rows.slice(1);
            return { postcodeHeader, postcodeData };
        })
        .catch(error => {
            console.error("Error loading postcodes.csv:", error);
            return null;
        });

    if (!postcodeCSV) {
        console.error("postcodes.csv is missing or invalid.");
        return csvData;
    }

    const postcodeData = postcodeCSV.postcodeData;
    const postcodeHeader = postcodeCSV.postcodeHeader;
    const geojsonData = await fetch('geojsondata.geojson')
        .then(response => response.json())
        .catch(error => {
            console.error("Error loading geojsondata.geojson:", error);
            return null;
        });

    if (!geojsonData) {
        console.error("geojsondata.geojson is missing or invalid.");
        return csvData;
    }

    // Get indices of 'Postcode', 'Longitude', 'Latitude', and 'PAR23CD' in postcodes.csv
    const postcodeColIndex = postcodeHeader.indexOf('Postcode');
    const longitudeColIndex = postcodeHeader.indexOf('Longitude');
    const latitudeColIndex = postcodeHeader.indexOf('Latitude');
    const parishColIndex = postcodeHeader.indexOf('PAR23CD');

    if (postcodeColIndex === -1 || longitudeColIndex === -1 || latitudeColIndex === -1 || parishColIndex === -1) {
        console.error("Missing required columns in postcodes.csv.");
        return csvData;
    }

    // Process data rows asynchronously
    const processedData = await Promise.all(csvData.slice(1).map(async row => {
        let newRow = [...row];
        const postcode = row[postcodeIndex];

        let longitude = null;
        let latitude = null;
        let PAR23CD = null;

        // Look up postcode in postcodes.csv first
        const postcodeRecord = postcodeData.find(postcodeRow => postcodeRow[postcodeColIndex] === postcode);

        if (postcodeRecord) {
            longitude = parseFloat(postcodeRecord[longitudeColIndex]);
            latitude = parseFloat(postcodeRecord[latitudeColIndex]);
            PAR23CD = postcodeRecord[parishColIndex];
        }

        // If postcode is not found in postcodes.csv, use geocoding API
        if (!longitude && !latitude) {
            if (postcode) {
                const { longitude: lon, latitude: lat } = await geocodePostcode(postcode);
                longitude = lon;
                latitude = lat;
            }
        }

        // Create a Turf.js point from the coordinates if geocoding was used
        if (longitude !== null && latitude !== null) {
            const teamPoint = turf.point([longitude, latitude]);

            // If geocoding was used, find the matching parish for the point
            if (!PAR23CD) {
                geojsonData.features.forEach(feature => {
                    if (turf.booleanPointInPolygon(teamPoint, feature)) {
                        PAR23CD= feature.properties.PAR23CD;
                    }
                });
            }
        }

        // Append Longitude, Latitude, and PAR23CD to the row
        newRow.push(longitude, latitude, PAR23CD || 'Unknown');
        return newRow;
    }));

    return [headers, ...processedData];
}



async function geocodePostcode(postcode, retries = 3, delay = 1000) {
    postcode = postcode.trim();
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(postcode)}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        console.log(`Geocoding: '${postcode}' (Attempt ${attempt})`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'my-geocoding-app'
                }
            });

            if (response.status === 429) {  // Rate limit exceeded
                const retryAfter = response.headers.get('Retry-After');
                if (retryAfter) {
                    console.log(`Rate limit exceeded. Retrying after ${retryAfter} seconds.`);
                    await sleep(retryAfter * 1000);  // Convert to milliseconds
                } else {
                    // If Retry-After header is not set, fallback to a default delay
                    console.log('Rate limit exceeded, retrying after default delay.');
                    await sleep(3000); // Fallback to 3 seconds
                }
                continue; // Retry after delay
            }

            const data = await response.json();
            if (data.length > 0) {
                const { lat, lon } = data[0];
                console.log(`Found: ${postcode} -> (${lon}, ${lat})`);
                return { longitude: parseFloat(lon), latitude: parseFloat(lat) };
            } else {
                console.log(`Postcode '${postcode}' not found.`);
            }

        } catch (error) {
            console.error(`Error geocoding '${postcode}':`, error);
        }

        // Exponential backoff
        if (attempt < retries) {
            const backoffDelay = delay * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(`Retrying in ${backoffDelay}ms...`);
            await sleep(backoffDelay);
        }
    }

    // Return null if all retries failed
    console.log(`All attempts failed for postcode '${postcode}'.`);
    return { longitude: null, latitude: null };
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}




function readCSVFile(file, callback) {
    const reader = new FileReader();
    reader.onload = function (event) {
        const text = event.target.result;
        const rows = text.split('\n').map(row => row.split(','));
        callback(rows);
    };
    reader.readAsText(file);
}


document.getElementById('upload-teams').addEventListener('change', handleTeamsUpload);
document.getElementById('upload-clubs').addEventListener('change', handleClubsUpload);

// Load GeoJSON data
fetch('geojsondata.geojson')
    .then(response => response.json())
    .then(data => {
        console.log('Loaded GeoJSON:', data); // Check data structure in the console
        geojsonLayer = L.geoJSON(data, {
            style: feature => ({
                color: 'blue',
                weight: 2,
                fillColor: 'red',
                fillOpacity: 0.5
            }),
            onEachFeature: (feature, layer) => {
                if (feature.properties) {
                    const popupContent = `
                        <strong>PAR23CD:</strong> ${feature.properties.PAR23CD}<br />
                        <strong>Location Name:</strong> ${feature.properties.PAR23NM_x}
                    `;
                    layer.bindPopup(popupContent);
                }
            }
        });

        geojsonLayer.addTo(map);
        
    })
    .catch(error => console.error('Error loading GeoJSON:', error));

// Define star level colors
const starColors = {
    0: 'grey',
    1: 'red',
    2: 'yellow',
    3: 'green'
};
function star_to_number(star_rating) {
    if (star_rating === '★★★★') {
        return 4;
    }
    if (star_rating === '★★★★★') {
        return 5;
    }
    if (star_rating === '★★★') {
        return 3;
    }
    if (star_rating === '★★') {
        return 2;
    }
    if (star_rating === '★') {
        return 1;
    }
    return 0;  // In case there are unexpected values
}

// Create a new pane for markers
map.createPane('markerPane');
map.getPane('markerPane').style.zIndex = 650; // Higher than the default overlay pane (400)
function processCSVData() {
    if (!teamsCsvData || !clubsCsvData) {
        console.error('Missing CSV data.');
        return;
    }

    const teamHeaders = teamsCsvData[0];
    const clubHeaders = clubsCsvData[0];

    const latitudeIndex = teamHeaders.indexOf('Latitude');
    const longitudeIndex = teamHeaders.indexOf('Longitude');
    const starLevelIndex = teamHeaders.indexOf('Star Level');
    const clubNameIndex = teamHeaders.indexOf('Club Name');
    const IDIndex = teamHeaders.indexOf('Club PFF ID');
    const par23cdIndex = teamHeaders.indexOf('PAR23CD');

    const clubIDIndex = clubHeaders.indexOf('Club PFF ID');

    if (latitudeIndex === -1 || longitudeIndex === -1 || starLevelIndex === -1 || IDIndex === -1) {
        console.error('Missing required columns in CSV.');
        return;
    }
    
    teamsCsvData.slice(1).forEach(teamRow => {
        const latitude = parseFloat(teamRow[latitudeIndex]);
        const longitude = parseFloat(teamRow[longitudeIndex]);
        const starLevel = star_to_number(teamRow[starLevelIndex]);

        
        const clubName = teamRow[clubNameIndex];
        const clubPFFID = teamRow[IDIndex];
        const PAR23CD = teamRow[par23cdIndex];
        

        if (isNaN(latitude) || isNaN(longitude) || isNaN(starLevel)) {
            console.log(`Invalid values - Latitude: ${latitude}, Longitude: ${longitude}, Star Level: ${starLevel}`);
            return;
        }
        
        
        const matchingClubRows = clubsCsvData.slice(1).filter(clubRow => clubRow[clubIDIndex] === clubPFFID);
        
        const ageGroups = [];
        const Genders = [];
        const GendersAge = [];
        const D = [];

        matchingClubRows.forEach(matchedRow => {
            ageGroups.push(matchedRow[7]);
            Genders.push(matchedRow[9]);
            D.push(matchedRow[10]);
            GendersAge.push(matchedRow[7] + matchedRow[9] + matchedRow[10]);
        });

        allAgeGroups = new Set([...allAgeGroups, ...ageGroups]);
        allGenderGroups = new Set([...allGenderGroups, ...Genders]);
        allDGroups = new Set([...allDGroups, ...D]);
        allGenderAgeGroups = new Set([...allGenderAgeGroups, ...GendersAge]);

        const marker = L.circleMarker([latitude, longitude], {
            pane: 'markerPane',
            radius: 8,
            fillColor: starColors[starLevel] || 'black',
            color: 'black',
            weight: 4,
            fillOpacity: 0.8
        }).bindPopup(`<strong>Club:</strong> ${clubName || 'Unknown'}<br>`);

        marker.starLevel = starLevel;
        marker.ageGroups = ageGroups;
        marker.clubName = clubName;
        marker.genders = Genders;
        marker.gendersage = GendersAge;
        marker.clubPFFID = clubPFFID;
        marker.ddd = D;
        marker.par23cd = PAR23CD;
        allMarkers.push(marker);

        marker.on('click', () => {
            const teamInfo = matchingClubRows.map(matchedRow => ({
                clubPFFID: matchedRow[clubIDIndex],
                teamPFFID: matchedRow[5],
                countyFA: matchedRow[0],
                region: matchedRow[1],
                teamName: matchedRow[3],
                ageGroup: matchedRow[7],
                gender: matchedRow[9],
                accreditationStatus: matchedRow[16],
                starLevel: matchedRow[17],
                disability: matchedRow[10]
            }));

                        // Show club information
                        console.log(teamInfo)
                        document.getElementById('team-name').textContent = `Club Name: ${clubName || 'Unknown'}`;
                        document.getElementById('team-id').textContent = `Club PFF ID: ${clubPFFID}`;
                        document.getElementById('team-star-level').textContent = `Star Level: ${starLevel}`;
                        document.getElementById('team-accreditation-status').textContent = `Accreditation Status: ${teamInfo.accreditationStatus}`;
                        document.getElementById('team-county').textContent = `County FA: ${teamInfo.countyFA}`;
                        document.getElementById('team-region').textContent = `Region: ${teamInfo.region}`;

            let teamDetailsHTML = '';
            teamInfo.forEach(team => {
                if (
                    (selectedStarLevels.length === 0 || selectedStarLevels.includes(starLevel) || selectedStarLevels === "-1") &&
                    (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(team.ageGroup) || selectedAgeGroups === "") &&
                    (selectedGender.length === 0 || selectedGender.includes(team.gender) || selectedGender === "") &&
                    (selectedD.length === 0 || selectedD.includes(team.disability) || selectedD === "")
                ) {
                    teamDetailsHTML += `
                        <div class="maincontent-container">
                            <div class="maincontent1">
                                <div class="team-name">${team.teamName}</div>
                                <strong>Team Age Group:</strong> ${team.ageGroup}<br>
                                <strong>Team Gender:</strong> ${team.gender}<br>
                                <strong>Team Disability:</strong> ${team.disability}<br>
                                <strong>Accreditation Status:</strong> ${team.accreditationStatus}<br>
                                <strong>Star Level:</strong> ${team.starLevel}<br>
                            </div>
                        </div>`;
                }
            });

            document.getElementById('team-details').innerHTML = teamDetailsHTML;
        });

        marker.addTo(map);
    });

// Load and process the teams_df1 (2).csv file

    createAgeGroupCheckboxes();
    createGenderGroupCheckboxes();
    createDGroupCheckboxes();

            

}
// Event listener for the filter dropdown (Star Level)
document.getElementById('star-filter').addEventListener('change', () => {
    const selectedOptions = Array.from(document.getElementById('star-filter').selectedOptions);
    if (selectedOptions.length === 0 || selectedOptions[0].value === "-1") {
        selectedStarLevels = [];  // "All" selected: no star level filter
    } else {
        selectedStarLevels = selectedOptions.map(option => parseInt(option.value, 10));
    }
    
    // Update the map with the filtered markers
    applyFilters();
});
function createAgeGroupCheckboxes() {
    const container = document.getElementById('age-group-checkboxes');

    // Clear any existing checkboxes to avoid duplicates
    container.innerHTML = '';

    if (allAgeGroups.size === 0) {
        container.textContent = 'No age groups found in data.';
        return;
    }

    // Loop through all unique age groups and create checkboxes
    allAgeGroups.forEach(ageGroup => {
        // Create checkbox input
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `age-group-${ageGroup}`;
        checkbox.value = ageGroup;

        // Add event listener to apply filters when checked/unchecked
        checkbox.addEventListener('change', () => {
            // Update the selected age groups list
            selectedAgeGroups = Array.from(document.querySelectorAll('#age-group-checkboxes input:checked')).map(
                checkbox => checkbox.value
            );

            // Apply filters after selection
            applyFilters();
        });

        // Create label for the checkbox
        const label = document.createElement('label');
        label.htmlFor = `age-group-${ageGroup}`;
        label.textContent = ageGroup;

        // Append checkbox and label to the container
        container.appendChild(checkbox);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
}
function createGenderGroupCheckboxes() {
    const container = document.getElementById('gender-group-checkboxes');

    // Clear any existing checkboxes to avoid duplicates
    container.innerHTML = '';

    if (allGenderGroups.size === 0) {
        container.textContent = 'No gender groups found in data.';
        return;
    }

    // Loop through all unique age groups and create checkboxes
    allGenderGroups.forEach(genderGroup => {
        // Create checkbox input
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `gender-group-${genderGroup}`;
        checkbox.value = genderGroup;

        // Add event listener to apply filters when checked/unchecked
        checkbox.addEventListener('change', () => {
            // Update the selected age groups list
            selectedGender = Array.from(document.querySelectorAll('#gender-group-checkboxes input:checked')).map(
                checkbox => checkbox.value
            );

            // Apply filters after selection
            applyFilters();
        });

        // Create label for the checkbox
        const label = document.createElement('label');
        label.htmlFor = `gender-group-${genderGroup}`;
        label.textContent = genderGroup;

        // Append checkbox and label to the container
        container.appendChild(checkbox);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
}
function createDGroupCheckboxes() {
    const container = document.getElementById('D-group-checkboxes');

    // Clear any existing checkboxes to avoid duplicates
    container.innerHTML = '';

    if (allDGroups.size === 0) {
        container.textContent = 'No gender groups found in data.';
        return;
    }

    // Loop through all unique age groups and create checkboxes
    allDGroups.forEach(DGroup => {
        // Create checkbox input
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `D-group-${DGroup}`;
        checkbox.value = DGroup;

        // Add event listener to apply filters when checked/unchecked
        checkbox.addEventListener('change', () => {
            // Update the selected age groups list
            selectedD = Array.from(document.querySelectorAll('#D-group-checkboxes input:checked')).map(
                checkbox => checkbox.value
            );

            // Apply filters after selection
            applyFilters();
        });

        // Create label for the checkbox
        const label = document.createElement('label');
        label.htmlFor = `D-group-${DGroup}`;
        label.textContent = DGroup;

        // Append checkbox and label to the container
        container.appendChild(checkbox);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
}

function logSelectedFilters() {
    // Get all checked age group checkboxes' ids
    const selectedAgeGroupIds = Array.from(document.querySelectorAll('#age-group-checkboxes input:checked'))
                                      .map(checkbox => checkbox.value);

    // Get all checked gender group checkboxes' ids
    const selectedGenderGroupIds = Array.from(document.querySelectorAll('#gender-group-checkboxes input:checked'))
                                         .map(checkbox => checkbox.value);
    const selectedDGroupIds = Array.from(document.querySelectorAll('#D-group-checkboxes input:checked'))
                                         .map(checkbox => checkbox.value);

    const combinations = [];

        // Create combinations of age group and gender group ids
    const hasAgeGroups = selectedAgeGroupIds.length > 0;
    const hasGenderGroups = selectedGenderGroupIds.length > 0;
    const hasDisabilityGroups = selectedDGroupIds.length > 0;

    if (hasAgeGroups && hasGenderGroups && hasDisabilityGroups) {
        // If all three contain items, perform the original loop for all combinations
        selectedAgeGroupIds.forEach(ageGroupId => {
            selectedGenderGroupIds.forEach(genderGroupId => {
                selectedDGroupIds.forEach(DGroupId => {
                    // Combine the ids of age group, gender group, and disability group
                    const combination = ageGroupId + genderGroupId + DGroupId;
                    combinations.push(combination);

                    
                });
            });
        });
    } else if (hasAgeGroups && hasGenderGroups) {
        // If only Age and Gender groups contain values
        selectedAgeGroupIds.forEach(ageGroupId => {
            selectedGenderGroupIds.forEach(genderGroupId => {
                // Create combinations for Age and Gender only
                combinations.push(
                    ageGroupId + genderGroupId + "NonDisability",
                    ageGroupId + genderGroupId + "PanDisability",
                    ageGroupId + genderGroupId + "Wheelchair",
                );
            });
        });
    }else if (hasAgeGroups && hasDisabilityGroups) {
        // If only Age and Gender groups contain values
        selectedAgeGroupIds.forEach(ageGroupId => {
            selectedDGroupIds.forEach(DGroupId => {
                // Create combinations for Age and Gender only
                combinations.push(
                    ageGroupId + "Mixed" + DGroupId,
                    ageGroupId + "Female" + DGroupId,
                    ageGroupId + "Male" + DGroupId,
                );
            });
        });
    }else if (hasGenderGroups && hasDisabilityGroups) {
        // If only Age and Gender groups contain values
        selectedDGroupIds.forEach(DGroupId => {
            selectedGenderGroupIds.forEach(genderGroupId => {
                // Create combinations for Age and Gender only
                combinations.push(
                    "U5" + genderGroupId + DGroupId,
                    "U6" + genderGroupId + DGroupId,
                    "U7" + genderGroupId + DGroupId,
                    "U8" + genderGroupId + DGroupId,
                    "U9" + genderGroupId + DGroupId,
                    "U10" + genderGroupId + DGroupId,
                    "U11" + genderGroupId + DGroupId,
                    "U12" + genderGroupId + DGroupId,
                    "U13" + genderGroupId + DGroupId,
                    "U14" + genderGroupId + DGroupId,
                    "U15" + genderGroupId + DGroupId,
                    "U16" + genderGroupId + DGroupId,
                    "U17" + genderGroupId + DGroupId,
                    "U8" + genderGroupId + DGroupId,
                    "Open" + genderGroupId + DGroupId,
                    "Veterans" + genderGroupId + DGroupId,

                );
            });
        });
    }
    
                
    
    return combinations;
}


// Function to filter markers based on both age groups and star levels
function applyFilters() {
    // Remove all markers from the map
    allMarkers.forEach(marker => map.removeLayer(marker));
    combinations=logSelectedFilters()
    

    // Add markers that match both selected age groups and star levels
    allMarkers
        .filter(marker => 
            (selectedStarLevels.length === 0 || selectedStarLevels.includes(marker.starLevel)) &&
            (selectedAgeGroups.length === 0 || marker.ageGroups.some(group => selectedAgeGroups.includes(group))) &&
            (selectedGender.length === 0 || marker.genders.some(group => selectedGender.includes(group))) &&
            (combinations.length === 0 || marker.gendersage.some(group => combinations.includes(group))) &&
            (selectedD.length === 0 || marker.ddd.some(group => selectedD.includes(group)))
            
            
        )
        .forEach(marker => marker.addTo(map));
        updateGeoJSONLayer();
}

function countClubsByPar23cd() {
    const counts = {};

    allMarkers
        .filter(marker => 
            (selectedStarLevels.length === 0 || selectedStarLevels.includes(marker.starLevel)) &&
            (selectedAgeGroups.length === 0 || marker.ageGroups.some(group => selectedAgeGroups.includes(group))) &&
            (selectedGender.length === 0 || marker.genders.some(group => selectedGender.includes(group))) &&
            (logSelectedFilters().length === 0 || marker.gendersage.some(group => logSelectedFilters().includes(group))) &&
            

            (selectedD.length === 0 || marker.ddd.some(group => selectedD.includes(group)))
        )

        
        .forEach(marker => {
            
            if (logSelectedFilters().length!==0){
                amount = marker.gendersage.filter(group => logSelectedFilters().includes(group)).length;
            }
            if (selectedAgeGroups.length !==0 && selectedStarLevels.length===0 && selectedGender.length===0 && selectedD.length===0 && logSelectedFilters().length===0){
                
                amount = marker.ageGroups.filter(group => selectedAgeGroups.includes(group)).length;
                
            }
            if (selectedAgeGroups.length ===0 && selectedStarLevels.length!==0 && selectedGender.length===0 && selectedD.length===0 && logSelectedFilters().length===0){
                if (selectedStarLevels.includes(marker.starLevel)){
                    amount = marker.genders.length;
                }
            }
            if (selectedAgeGroups.length ===0 && selectedStarLevels.length===0 && selectedGender.length!==0 && selectedD.length===0 && logSelectedFilters().length===0){
                amount = marker.genders.filter(group => selectedGender.includes(group)).length;
            }
            if (selectedAgeGroups.length ===0 && selectedStarLevels.length===0 && selectedGender.length===0 && selectedD.length!==0 && logSelectedFilters().length===0){
                amount = marker.ddd.filter(group => selectedD.includes(group)).length;
            }
            if (!counts[marker.par23cd]) counts[marker.par23cd] = 0;
            counts[marker.par23cd]+=amount;
        });
        

    return counts;
}
function findpercentofpop(){
    let scalarg = 0;
    let scalara = 0;
    let scalard = 0;

    // Calculate scalarg based on gender
    selectedGender.forEach(gender => {
        if (gender === "Male" || gender === "Female") {
            scalarg += 0.5; // Add 0.5 for each Male or Female
        } else {
            scalarg = 1; // Add 1 for other gender categories
        }
    });

    if (scalarg ===0){
        scalarg=1
    }
    // Calculate scalara based on age groups
    selectedAgeGroups.forEach(ageGroup => {
        switch (ageGroup) {
            case "U5":
            case "U6":
            case "U7":
            case "U8":
            case "U9":
            case "U10":
            case "U11":
            case "U12":
            case "U13":
            case "U14":
            case "U15":
            case "U16":
                scalara += 0.0125; // Add 0.0125 for each U5-U16 group
                break;
            case "U18":
                scalara += 0.025; // Add 0.025 for U18
                break;
            case "Open":
            case "Veteran":
                scalara += 0.2875; // Add 0.2875 for Open or Veteran
                break;
        }
    });
    if (scalara ===0){
        scalara=1
    }

    // Calculate scalard based on disability categories
    selectedD.forEach(disability => {
        if (disability === "PanDisability") {
            scalard += 0.005; // Add 0.05 for PanDisability
        } else if (disability === "Wheelchair") {
            scalard += 0.0025; // Add 0.025 for Wheelchair
        } else if (disability === "NonDisability") {
            scalard = 1; // Add 0.025 for Wheelchair
        }

    });
    if (scalard ===0){
        scalard=1
    }
    // Calculate the total percentage
    
    const totalPercent = scalara * scalarg * scalard;
    return totalPercent;
}
function findmeanandstd(clubCount,percentofpop){
    let teamsPer50List = [];
    geojsonLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties) {
            const par23cd = layer.feature.properties.PAR23CD;
            const population = layer.feature.properties.pop_7;  // Assuming pop_7 holds the population data

            // Calculate the target population adjusted by percentofpop
            const targetPop = (population / 0.00625) * percentofpop;

            // Get the number of teams for the current par23cd from clubCount
            const numberOfTeams = clubCount[par23cd] || 0;  // Default to 0 if no teams found

            // Calculate teams per 50
            const teamsPer50 = (numberOfTeams / targetPop) * 50;

            // Store the teamsPer50 value
            teamsPer50List.push(teamsPer50);
        }
    });
    const mean = teamsPer50List.reduce((sum, value) => sum + value, 0) / teamsPer50List.length;

    // Calculate standard deviation
    const variance = teamsPer50List.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / teamsPer50List.length;
    const stdDev = Math.sqrt(variance);
    return {mean, stdDev};

}

function updateGeoJSONLayer() {
    if (!geojsonLayer) {
        console.error('GeoJSON layer is not initialized.');
        return;
    }
    clubCount=countClubsByPar23cd();
    percentofpop = findpercentofpop();
    ({ mean: meanTeamsPer50, stdDev: stdDevTeamsPer50 } = findmeanandstd(clubCount, percentofpop));
    console.log(meanTeamsPer50);
    geojsonLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties) {
            
            const par23cd = layer.feature.properties.PAR23CD;
            
            const targetpop = ((layer.feature.properties.pop_7)/0.00625)*percentofpop;
            
            // Perform filtering and styling
            
            const countForCurrentPar23cd = clubCount[par23cd] || 0; // Default to 0 if not found

            teamsper50= (countForCurrentPar23cd/targetpop)*50;
            
            
            console.log((layer.feature.properties.pop_7)/0.00625,percentofpop,countForCurrentPar23cd,targetpop,teamsper50)

            layer.setStyle({
                fillColor: getColorBasedOnTeamsPer50(teamsper50, meanTeamsPer50,stdDevTeamsPer50),
                fillOpacity: 1,
                color: 'blue',
                weight: 2
            });
            const popupContent = `
                <strong>PAR23CD:</strong> ${layer.feature.properties.PAR23CD}<br />
                <strong>Location Name:</strong> ${layer.feature.properties.PAR23NM_x}<br />
                <strong>Population After Filtering:</strong> ${targetpop.toFixed(2)}<br />
                <strong>Teams Per 50:</strong> ${teamsper50.toFixed(2)}
            `;
            layer.bindPopup(popupContent);
        }
    });
}
function getColorBasedOnTeamsPer50(teamsPer50, meanTeamsPer50, stdDevTeamsPer50) {
    // Normalize the teamsPer50 value based on the mean and standard deviation
    // Here, we want to scale based on the spread, using (value - mean) / stdDev
    
    let normalizedValue = (teamsPer50 - meanTeamsPer50) / stdDevTeamsPer50;
    
    // Clamp the normalized value to avoid extreme values (for example, values < -3 or > 3)
    normalizedValue = Math.max(-3, Math.min(3, normalizedValue));
    
    // Interpolate between colors (red for low values, yellow for mid values, and green for high values)
    const r = Math.round(255 * Math.max(0, 1 - Math.abs(normalizedValue)));
    const g = Math.round(255 * Math.max(0, Math.min(1, normalizedValue)));
    const b = 0; // Blue remains 0 for the red-to-green gradient
    
    // Return the color in RGB format
    return `rgb(${r}, ${g}, ${b})`;
}

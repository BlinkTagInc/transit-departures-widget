/* global window, Pbf, FeedMessage, alert, accessibleAutocomplete,  */
/* eslint no-var: "off", no-unused-vars: "off", no-alert: "off" */

function setupTransitDeparturesWidget(routes, stops, config) {
  let departuresResponse
  let departuresTimeout
  let initialStop
  let selectedParameters
  let url = new URL(config.gtfsRtTripupdatesUrl)

  function updateUrlWithStop(stop) {
    const url = new URL(window.location.origin + window.location.pathname)
    url.searchParams.append('stop', stop.stop_code || stop.stop_id)

    window.history.pushState(null, null, url)
  }

  async function fetchTripUpdates() {
    const response = await fetch(url)
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer()
      const pbf = new Pbf(new Uint8Array(bufferResponse))
      const object = FeedMessage.read(pbf)

      return object.entity
    }

    throw new Error(response.status)
  }

  function formatMinutes(seconds) {
    if (seconds < 60) {
      return '&#60;1'
    }

    return Math.floor(seconds / 60)
  }

  function formatDirectionId(directionId) {
    if (directionId === null || directionId === undefined) {
      return '0'
    }

    return directionId?.toString()
  }

  function timeStamp() {
    const now = new Date()
    let hours = now.getHours()
    let minutes = now.getMinutes()

    if (minutes < 10) {
      minutes = '0' + minutes
    }

    if (config.timeFormat === '24hour') {
      return `${hours}:${minutes}`
    }

    const suffix = hours < 12 ? 'AM' : 'PM'
    hours = hours < 12 ? hours : hours - 12
    hours = hours || 12

    return `${hours}:${minutes} ${suffix}`
  }

  function sortBy(array, selector) {
    return [...array].sort((left, right) => {
      const leftValue = selector(left)
      const rightValue = selector(right)

      if (leftValue < rightValue) {
        return -1
      }

      if (leftValue > rightValue) {
        return 1
      }

      return 0
    })
  }

  function groupBy(array, selector) {
    return array.reduce((groups, item) => {
      const key = selector(item)
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(item)
      return groups
    }, {})
  }

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback)
    } else {
      callback()
    }
  }

  function setHidden(element, isHidden) {
    if (!element) {
      return
    }

    if (isHidden) {
      if (!element.dataset.originalDisplay) {
        const computedDisplay = window.getComputedStyle(element).display
        if (computedDisplay && computedDisplay !== 'none') {
          element.dataset.originalDisplay = computedDisplay
        }
      }
      element.style.display = 'none'
      return
    }

    element.style.display = element.dataset.originalDisplay || 'block'
  }

  function setText(element, text) {
    if (!element) {
      return
    }

    element.textContent = text
  }

  function clearSelectOptions(select, startIndex = 1) {
    if (!select) {
      return
    }

    while (select.options.length > startIndex) {
      select.remove(startIndex)
    }
  }

  onReady(() => {
    const departureResults = document.querySelector('#departure_results')
    const departureResultsContainer = departureResults?.querySelector(
      '.departure-results-container',
    )
    const departureResultsNone = departureResults?.querySelector(
      '.departure-results-none',
    )
    const departureResultsError = departureResults?.querySelector(
      '.departure-results-error',
    )
    const departureResultsStop = departureResults?.querySelector(
      '.departure-results-stop',
    )
    const departureResultsStopUnknown = departureResults?.querySelector(
      '.departure-results-stop-unknown',
    )
    const departureResultsStopCode = departureResults?.querySelector(
      '.departure-results-stop-code',
    )
    const departureResultsStopCodeContainer = departureResults?.querySelector(
      '.departure-results-stop-code-container',
    )
    const departureResultsRefreshButton = departureResults?.querySelector(
      '.departure-results-refresh-button',
    )
    const departureResultsFetchTime = departureResults?.querySelector(
      '.departure-results-fetchtime',
    )
    const stopCodeInvalidElements =
      document.querySelectorAll('.stop-code-invalid')
    const loadingIndicator = document.querySelector('#loading')
    const departureTypeInputs = document.querySelectorAll(
      '#real_time_departures input[name="departure_type"]',
    )
    const departureTypeStopInput = document.querySelector(
      '#real_time_departures input[name="departure_type"][value="stop"]',
    )
    const routeForm = document.querySelector(
      '#real_time_departures #route_form',
    )
    const stopForm = document.querySelector('#real_time_departures #stop_form')
    const departureRouteSelect = document.querySelector('#departure_route')
    const departureDirectionSelect = document.querySelector(
      '#real_time_departures #departure_direction',
    )
    const departureStopSelect = document.querySelector(
      '#real_time_departures #departure_stop',
    )
    const stopCodeContainer = document.querySelector(
      '#departure_stop_code_container',
    )
    const getStopCodeInput = () =>
      document.querySelector('#departure_stop_code')
    // Populate dropdown with all routes
    if (departureRouteSelect) {
      for (const route of routes) {
        const option = document.createElement('option')
        option.value = route.route_id
        option.textContent = route.route_full_name
        departureRouteSelect.appendChild(option)
      }
    }

    // Read URL parameters on load
    readUrlWithParameters()

    function readUrlWithParameters() {
      const url = new URL(window.location.href)
      const stopFromURL = url.searchParams.get('stop')

      if (!stopFromURL) {
        return
      }

      const stop = stops.find(
        (stop) =>
          stop.stop_id === stopFromURL || stop.stop_code === stopFromURL,
      )

      if (!stop) {
        return
      }

      initialStop = stop.stop_code || stop.stop_name

      // Wait for js to initialize before triggering click
      setTimeout(() => {
        stopForm?.dispatchEvent(new Event('submit'))
        departureTypeStopInput?.dispatchEvent(new Event('click'))
      }, 100)
    }

    function resetResults() {
      if (departuresTimeout) {
        clearInterval(departuresTimeout)
      }

      setHidden(departureResults, true)
    }

    function showLoading() {
      setHidden(loadingIndicator, false)
    }

    function hideLoading() {
      setHidden(loadingIndicator, true)
    }

    function renderStopInfo(selectedStops) {
      if (selectedStops && selectedStops.length > 0) {
        setHidden(departureResultsStopUnknown, true)
        setText(departureResultsStop, selectedStops[0].stop_name)
        setHidden(departureResultsStop, false)
      } else {
        setHidden(departureResultsStop, true)
        setHidden(departureResultsStopUnknown, false)
      }

      if (
        selectedStops &&
        selectedStops.length === 1 &&
        selectedStops[0].stop_code &&
        !selectedStops[0].is_parent_station
      ) {
        setText(departureResultsStopCode, selectedStops[0].stop_code)
        setHidden(departureResultsStopCodeContainer, false)
      } else {
        setHidden(departureResultsStopCodeContainer, true)
      }

      setText(departureResultsFetchTime, timeStamp())
    }

    function formatDepartureGroup(departureGroup) {
      const div = document.createElement('div')
      div.classList.add('departure-result')
      const { route, direction } = departureGroup[0]

      const routeNameDiv = document.createElement('div')
      routeNameDiv.classList.add('departure-result-route-name')
      div.appendChild(routeNameDiv)

      const departureTimesDiv = document.createElement('div')
      departureTimesDiv.classList.add('departure-result-times')
      div.appendChild(departureTimesDiv)

      if (route.route_short_name) {
        const routeColor = route.route_color ? `#${route.route_color}` : '#ccc'
        const routeTextColor = route.route_text_color
          ? `#${route.route_text_color}`
          : '#000'
        const routeCircle = document.createElement('div')
        routeCircle.textContent = route.route_short_name
        routeCircle.classList.add('departure-result-route-circle')
        routeCircle.style.backgroundColor = routeColor
        routeCircle.style.color = routeTextColor
        routeNameDiv.appendChild(routeCircle)
      }

      const routeDirection = document.createElement('div')
      routeDirection.textContent = direction.direction
      routeDirection.classList.add('departure-result-route-direction')
      routeNameDiv.appendChild(routeDirection)

      const sortedDepartures = sortBy(
        departureGroup,
        (departure) => departure.time,
      ).slice(0, 3)

      for (const departure of sortedDepartures) {
        const minutes = formatMinutes(departure.time - Date.now() / 1000)
        const minutesLabel =
          departureResultsContainer?.dataset?.minutesLabel ?? ''

        const timeContainer = document.createElement('div')
        timeContainer.classList.add('departure-result-time-container')
        const timeValue = document.createElement('div')
        timeValue.classList.add('departure-result-time')
        timeValue.innerHTML = `${minutes}<span class="departure-result-time-label">${minutesLabel}</span>`
        timeContainer.appendChild(timeValue)
        departureTimesDiv.appendChild(timeContainer)
      }

      return div
    }

    function renderResults(selectedStops, departures) {
      renderStopInfo(selectedStops)

      if (departures.length === 0) {
        setHidden(departureResultsContainer, true)
        setHidden(departureResultsError, true)
        setHidden(departureResultsNone, false)
      } else {
        const departureGroups = groupBy(
          departures,
          (departure) =>
            `${departure.route.route_id}||${departure.direction.direction_id}`,
        )
        const sortedDepartureGroups = sortBy(
          Object.values(departureGroups),
          (departureGroup) => {
            const { route } = departureGroup[0]
            return Number.parseInt(route.route_short_name, 10)
          },
        )
        setHidden(departureResultsNone, true)
        setHidden(departureResultsError, true)

        if (departureResultsContainer) {
          departureResultsContainer.innerHTML = ''
          for (const departureGroup of sortedDepartureGroups) {
            departureResultsContainer.appendChild(
              formatDepartureGroup(departureGroup),
            )
          }
        }

        setHidden(departureResultsContainer, false)
      }

      hideLoading()
      setHidden(departureResults, false)
    }

    function renderError(selectedStops) {
      renderStopInfo(selectedStops)
      setHidden(departureResultsError, false)

      hideLoading()
      setHidden(departureResults, false)
    }

    function findStops(stopId, stopName) {
      let selectedStops
      if (stopId !== undefined) {
        const selectedStop = stops.find((stop) => stop.stop_id === stopId)

        if (selectedStop) {
          selectedStops = [selectedStop]
        }
      } else {
        selectedStops = stops.filter(
          (stop) =>
            stop.stop_id === stopName ||
            stop.stop_code === stopName ||
            stop.stop_name === stopName,
        )
      }

      if (selectedStops) {
        // Use parent stop if it exists
        for (const stop of selectedStops) {
          if (stop.parent_station !== null) {
            const parentStationStop = stops.find(
              (s) => s.stop_id === stop.parent_station,
            )
            if (parentStationStop) {
              return [parentStationStop]
            }
          }
        }

        return selectedStops
      }

      // No stops found
      return undefined
    }

    function selectParameters({ stopId, stopName, directionId, routeId }) {
      for (const element of stopCodeInvalidElements) {
        setHidden(element, true)
      }
      const selectedStops = findStops(stopId, stopName)
      const route = routes.find((route) => route.route_id === routeId)
      const direction = route
        ? route.directions.find(
            (direction) =>
              formatDirectionId(direction.direction_id) === directionId,
          )
        : undefined

      if (!selectedStops || selectedStops.length === 0) {
        for (const element of stopCodeInvalidElements) {
          setHidden(element, false)
        }
        return
      }

      selectedParameters = { selectedStops, direction, route }

      resetResults()
      showLoading()
      updateDepartures()

      // Every refresh interval seconds, check for tripupdates
      departuresTimeout = setInterval(
        () => updateDepartures(),
        config.refreshIntervalSeconds * 1000,
      )
    }

    function getRouteAndDirectionFromTrip(tripId) {
      let tripRoute
      let tripDirection
      for (const route of routes) {
        for (const direction of route.directions) {
          if (direction.tripIds.includes(tripId)) {
            tripDirection = direction
            tripRoute = route
            break
          }
        }

        if (tripDirection && tripRoute) {
          break
        }
      }

      return {
        route: tripRoute,
        direction: tripDirection,
      }
    }

    function filterDepartures(departures, { selectedStops, direction, route }) {
      // Remove departure and arrival information for last stoptime by stop_sequence if it has any
      const cleanedDepartures = departures.map((departure) => {
        const stopTimeUpdates = departure?.trip_update?.stop_time_update
        if (!stopTimeUpdates || stopTimeUpdates.length === 0) {
          return departure
        }

        let largestStopSequence = 0
        let largestStopSequenceIndex = 0
        for (let index = 0; index < stopTimeUpdates.length; index++) {
          if (stopTimeUpdates[index].stop_sequence > largestStopSequence) {
            largestStopSequence = stopTimeUpdates[index].stop_sequence
            largestStopSequenceIndex = index
          }
        }

        const filteredStopTimeUpdates = stopTimeUpdates.filter(
          (stopTimeUpdate, index) => index !== largestStopSequenceIndex,
        )

        return {
          ...departure,
          trip_update: {
            ...departure.trip_update,
            stop_time_update: filteredStopTimeUpdates,
          },
        }
      })

      const selectedStopIds = selectedStops.flatMap((stop) => {
        return stop.is_parent_station
          ? stops
              .filter((s) => s.parent_station === stop.stop_id)
              .map((stop) => stop.stop_id)
          : [stop.stop_id]
      })
      const filteredDepartures = []

      for (const departure of cleanedDepartures) {
        let filteredDeparture = {}

        if (route) {
          if (
            !departure ||
            !departure.trip_update ||
            !departure.trip_update.trip
          ) {
            continue
          }

          if (
            !direction ||
            !direction.tripIds.includes(departure.trip_update.trip.trip_id)
          ) {
            continue
          }

          filteredDeparture.route = route
          filteredDeparture.direction = direction
        } else if (selectedStops && selectedStops.length > 0) {
          if (
            !departure ||
            !departure.trip_update ||
            !departure.trip_update.stop_time_update
          ) {
            continue
          }

          // Get route and direction from trip_id
          filteredDeparture = getRouteAndDirectionFromTrip(
            departure.trip_update.trip.trip_id,
          )
        }

        const stoptime = departure.trip_update.stop_time_update.find(
          (stopTimeUpdate) => selectedStopIds.includes(stopTimeUpdate.stop_id),
        )

        if (!stoptime || (!stoptime.arrival && !stoptime.departure)) {
          continue
        }

        filteredDeparture.time =
          stoptime.departure?.time ?? stoptime.arrival?.time

        // Hide departures more than 90 minutes in the future
        if (filteredDeparture.time - Date.now() / 1000 > 90 * 60) {
          continue
        }

        // Hide departures more than 1 minute in the past
        if (filteredDeparture.time - Date.now() / 1000 < -60) {
          continue
        }

        filteredDepartures.push(filteredDeparture)
      }

      return filteredDepartures
    }

    async function updateDepartures(forceRefresh) {
      try {
        if (!selectedParameters) {
          return
        }

        const { selectedStops, direction, route } = selectedParameters
        // Use existing data if less than the refresh interval seconds old
        const minimumAge = Date.now() - config.refreshIntervalSeconds * 1000
        if (
          !departuresResponse ||
          departuresResponse.timestamp < minimumAge ||
          forceRefresh === true
        ) {
          const departures = await fetchTripUpdates()

          // Don't use new departure info if nothing is returned
          if (!departures) {
            console.error('No departures returned')
            return
          }

          departuresResponse = { departures, timestamp: Date.now() }
        }

        renderResults(
          selectedStops,
          filterDepartures(departuresResponse.departures, {
            selectedStops,
            direction,
            route,
          }),
        )

        if (selectedStops && selectedStops.length > 0) {
          updateUrlWithStop(selectedStops[0])
        }
      } catch (error) {
        console.error(error)
        renderError(selectedParameters?.selectedStops)
      }
    }

    for (const input of departureTypeInputs) {
      input.addEventListener('change', (event) => {
        const type = event.target.value

        if (routeForm) {
          routeForm.classList.toggle('hidden-form', type !== 'route')
        }
        if (stopForm) {
          stopForm.classList.toggle('hidden-form', type !== 'stop')
        }

        if (departureStopSelect) {
          departureStopSelect.value = ''
          departureStopSelect.disabled = true
        }

        clearSelectOptions(departureDirectionSelect)
        clearSelectOptions(departureStopSelect)
        resetResults()
      })
    }

    if (departureRouteSelect) {
      departureRouteSelect.addEventListener('change', (event) => {
        const routeId = event.target.value

        if (departureStopSelect) {
          departureStopSelect.value = ''
          departureStopSelect.disabled = true
        }

        clearSelectOptions(departureDirectionSelect)
        clearSelectOptions(departureStopSelect)
        resetResults()

        if (routeId === '') {
          if (departureDirectionSelect) {
            departureDirectionSelect.value = ''
            departureDirectionSelect.disabled = true
          }
        } else {
          if (departureDirectionSelect) {
            departureDirectionSelect.value = ''
            departureDirectionSelect.disabled = false
          }

          const route = routes.find((route) => route.route_id === routeId)

          if (!route) {
            return console.warn(`Unable to find route ${routeId}`)
          }

          if (departureDirectionSelect) {
            for (const direction of route.directions) {
              const option = document.createElement('option')
              option.value = formatDirectionId(direction.direction_id)
              option.textContent = direction.direction
              departureDirectionSelect.appendChild(option)
            }
          }

          if (route.directions.length === 1) {
            setHidden(departureDirectionSelect, true)
            if (departureDirectionSelect) {
              departureDirectionSelect.value = formatDirectionId(
                route.directions[0].direction_id,
              )
              departureDirectionSelect.dispatchEvent(new Event('change'))
            }
          } else {
            setHidden(departureDirectionSelect, false)
          }
        }
      })
    }

    if (departureDirectionSelect) {
      departureDirectionSelect.addEventListener('change', (event) => {
        const routeId = departureRouteSelect?.value
        const directionId = event.target.value

        clearSelectOptions(departureStopSelect)
        resetResults()

        if (directionId === '') {
          if (departureStopSelect) {
            departureStopSelect.value = ''
            departureStopSelect.disabled = true
          }
        } else {
          if (departureStopSelect) {
            departureStopSelect.value = ''
            departureStopSelect.disabled = false
          }

          const route = routes.find((route) => route.route_id === routeId)

          if (!route) {
            return console.warn(`Unable to find route ${routeId}`)
          }

          const direction = route.directions.find(
            (direction) =>
              formatDirectionId(direction.direction_id) === directionId,
          )

          if (!direction) {
            return console.warn(`Unable to find direction ${directionId}`)
          }

          if (departureStopSelect) {
            for (const stopId of direction.stopIds) {
              const stop = stops.find((stop) => stop.stop_id === stopId)
              const option = document.createElement('option')
              option.value = stop.stop_id
              option.textContent = stop.stop_name
              departureStopSelect.appendChild(option)
            }
          }
        }
      })
    }

    if (departureStopSelect) {
      departureStopSelect.addEventListener('change', (event) => {
        const routeId = departureRouteSelect?.value
        const directionId = departureDirectionSelect?.value
        const stopId = event.target.value

        selectParameters({
          stopId,
          routeId,
          directionId,
        })
      })
    }

    if (stopForm) {
      stopForm.addEventListener('submit', (event) => {
        event.preventDefault()
        for (const element of stopCodeInvalidElements) {
          setHidden(element, true)
        }

        const stopName = getStopCodeInput()?.value

        if (!stopName) {
          for (const element of stopCodeInvalidElements) {
            setHidden(element, false)
          }
          return
        }

        selectParameters({
          stopName,
        })
      })
    }

    if (departureResultsRefreshButton) {
      departureResultsRefreshButton.addEventListener('click', (event) => {
        event.preventDefault()
        resetResults()
        showLoading()
        updateDepartures(true)
      })
    }

    if (stopCodeContainer) {
      accessibleAutocomplete({
        element: stopCodeContainer,
        id: 'departure_stop_code',
        source(query, populateResults) {
          const filteredResults = stops.filter((stop) => {
            // Don't list child stations
            if (
              stop.parent_station !== null &&
              stop.parent_station !== undefined
            ) {
              return false
            }

            if (stop.stop_code?.startsWith(query.trim())) {
              return true
            }

            return stop.stop_name?.toLowerCase().includes(query.toLowerCase())
          })
          const sortedResults = sortBy(filteredResults, (stop) =>
            stop.stop_name?.toLowerCase().startsWith(query.toLowerCase().trim())
              ? 0
              : 1,
          )
          populateResults(sortedResults)
        },
        displayMenu: 'overlay',
        minLength: 2,
        autoselect: true,
        placeholder: stopCodeContainer?.dataset?.placeholder,
        showNoOptionsFound: false,
        templates: {
          inputValue: (result) =>
            result && (result.stop_code || result.stop_name),
          suggestion(result) {
            if (!result) {
              return
            }

            if (typeof result === 'string') {
              return result
            }

            const stopCode = result.is_parent_station
              ? stopCodeContainer?.dataset?.stopCodeAll
              : result.stop_code

            let formattedStopName = `<strong>${result.stop_name}</strong>`

            if (stopCode) {
              formattedStopName += ` (${stopCode})`
            }

            return formattedStopName
          },
        },
        onConfirm(selectedStop) {
          if (!selectedStop) {
            return
          }

          const stopCodeInput = getStopCodeInput()
          if (stopCodeInput) {
            stopCodeInput.value =
              selectedStop.stop_code || selectedStop.stop_name
          }
          stopForm?.dispatchEvent(new Event('submit'))
        },
        defaultValue: initialStop,
      })
    }
  })
}
